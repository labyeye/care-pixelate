const asyncHandler = require("express-async-handler");
const Appointment = require("../models/Appointment");
const Patient = require("../models/Patient");
const Doctor = require("../models/Doctor");
const { Clinic } = require("../models/Compliance");
const { pick, pageOpts } = require("../utils/pick");
const {
  generateSlots,
  istDateString,
  dayStart,
  isDateStr,
} = require("../utils/slots");
const { newRoom, linkFor, joinWindow } = require("../utils/video");
const mongoose = require("mongoose");
const slotLock = require("../utils/slotLock");
const { own } = require("../utils/doctorScope");
const { notifyAppointment } = require("../utils/whatsapp");

const FIELDS = [
  "clinicId",
  "patientId",
  "doctorId",
  "scheduledAt",
  "status",
  "reason",
  "notes",
  "type",
  "paymentStatus",
  "cancelReason",
];
const DAY = 24 * 60 * 60 * 1000;

const fail = (res, code, msg) => {
  res.status(code);
  throw new Error(msg);
};

// Free slots for a doctor+day, using the live bookings of that day.
const freeSlots = async (tenantId, doctor, dateStr, ignoreId) => {
  const from = dayStart(dateStr);
  const booked = await Appointment.find({
    tenantId,
    doctorId: doctor._id,
    status: "scheduled",
    endsAt: { $gt: from },
    scheduledAt: { $lt: new Date(from.getTime() + DAY) },
    ...(ignoreId && { _id: { $ne: ignoreId } }),
  }).select("scheduledAt endsAt");
  return generateSlots(
    doctor,
    dateStr,
    booked.map((b) => ({ start: b.scheduledAt, end: b.endsAt })),
  );
};

// Resolve patient/doctor inside the tenant and fill the derived fields (endsAt, fee, walk-in token).
const prepare = async (req, res, body, existing) => {
  const patientId = body.patientId || existing?.patientId;
  const doctorId = body.doctorId || existing?.doctorId;
  const [patient, doctor] = await Promise.all([
    Patient.exists({ _id: patientId, tenantId: req.tenantId }),
    Doctor.findOne({ _id: doctorId, tenantId: req.tenantId }),
  ]);
  if (!patient || !doctor)
    fail(res, 400, "Patient or doctor not found in this organisation");
  if (
    body.clinicId &&
    !(await Clinic.exists({
      _id: body.clinicId,
      tenantId: req.tenantId,
      status: "active",
    }))
  ) {
    fail(res, 400, "Location not found in this organisation");
  }
  if (
    doctor.accountStatus !== "active" ||
    doctor.consultation?.acceptingAppointments === false
  )
    fail(res, 400, "This doctor is not accepting appointments");

  const type = body.type || existing?.type || "in_clinic";
  if (
    type === "video" &&
    !doctor.consultation?.consultationModes?.includes("video")
  )
    fail(res, 400, "This doctor does not offer video consults");

  const changesTime = !existing || body.scheduledAt || body.doctorId;
  if (changesTime) {
    const start =
      type === "walk_in" && !body.scheduledAt
        ? new Date()
        : new Date(body.scheduledAt || existing.scheduledAt);
    if (isNaN(start)) fail(res, 400, "Invalid appointment time");
    const slotMs =
      (doctor.consultation?.appointmentDurationMinutes || 15) * 60 * 1000;
    body.scheduledAt = start;
    body.endsAt = new Date(start.getTime() + slotMs);

    if (type !== "walk_in") {
      if (start < new Date()) fail(res, 400, "Appointment time is in the past");
      // Doctors with no weekly schedule configured accept any time; the unique index still stops exact double-booking.
      if (doctor.availability?.length) {
        const free = await freeSlots(
          req.tenantId,
          doctor,
          istDateString(start),
          existing?._id,
        );
        if (!free.some((s) => s.start.getTime() === start.getTime())) {
          fail(res, 409, "That slot is not available");
        }
      }
    } else if (!existing) {
      const day = dayStart(istDateString(start));
      body.tokenNo =
        (await Appointment.countDocuments({
          tenantId: req.tenantId,
          doctorId: doctor._id,
          scheduledAt: { $gte: day, $lt: new Date(day.getTime() + DAY) },
          type: "walk_in",
        })) + 1;
    }
  }
  if (!existing) body.fee = doctor.consultation?.consultationFee || 0;
  if (type === "video" && !existing?.videoRoom) body.videoRoom = newRoom();
  return doctor;
};

const getAll = asyncHandler(async (req, res) => {
  const filter = { tenantId: req.tenantId };
  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.doctorId) filter.doctorId = String(req.query.doctorId);
  if (req.query.clinicId) filter.clinicId = String(req.query.clinicId);
  if (req.query.patientId) filter.patientId = String(req.query.patientId);
  Object.assign(filter, own(req)); // doctors: own appointments only (applied after ?doctorId so it can't widen the scope)
  if (req.query.date) {
    const from = dayStart(String(req.query.date));
    if (!isNaN(from))
      filter.scheduledAt = { $gte: from, $lt: new Date(from.getTime() + DAY) };
  }
  // Inclusive clinic-local date range (calendar views): ?from=YYYY-MM-DD&to=YYYY-MM-DD
  if (
    !req.query.date &&
    isDateStr(String(req.query.from || "")) &&
    isDateStr(String(req.query.to || ""))
  ) {
    const from = dayStart(String(req.query.from));
    const to = new Date(dayStart(String(req.query.to)).getTime() + DAY);
    if (to > from && to - from <= 62 * DAY)
      filter.scheduledAt = { $gte: from, $lt: to };
  }
  const { limit, skip } = pageOpts(req.query);
  const [appointments, total] = await Promise.all([
    Appointment.find(filter)
      .populate(
        "patientId",
        "firstName middleName lastName patientId contact.phone",
      )
      .populate(
        "doctorId",
        "firstName middleName lastName doctorId professionalDetails.specializations",
      )
      .sort({ scheduledAt: -1 })
      .skip(skip)
      .limit(limit),
    Appointment.countDocuments(filter),
  ]);
  res.json({
    success: true,
    count: appointments.length,
    total,
    data: appointments,
  });
});

const getOne = asyncHandler(async (req, res) => {
  const appointment = await Appointment.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
    ...own(req),
  })
    .populate(
      "patientId",
      "firstName middleName lastName patientId contact.phone",
    )
    .populate(
      "doctorId",
      "firstName middleName lastName doctorId professionalDetails.specializations",
    );
  if (!appointment) fail(res, 404, "Appointment not found");
  res.json({ success: true, data: appointment });
});

// Creates the booking and claims its time on the doctor's calendar. Walk-ins are queue entries
// (token numbers), so they don't hold a slot; every scheduled visit does.
const book = async (tenantId, body) => {
  const _id = new mongoose.Types.ObjectId();
  const holds = body.type !== "walk_in";
  if (holds)
    await slotLock.acquire({
      tenantId,
      doctorId: body.doctorId,
      appointmentId: _id,
      start: body.scheduledAt,
      end: body.endsAt,
    });
  try {
    return await Appointment.create({ ...body, _id, tenantId });
  } catch (e) {
    if (holds) await slotLock.release(_id);
    throw e;
  }
};

const create = asyncHandler(async (req, res) => {
  const body = pick(req.body, FIELDS);
  delete body.status; // new bookings always start as scheduled
  if (req.ownDoctorId) body.doctorId = req.ownDoctorId; // a doctor can only book into their own calendar
  await prepare(req, res, body, null);
  const appointment = await book(req.tenantId, body);
  notifyAppointment("appointment_confirmed", appointment._id);
  res.status(201).json({ success: true, data: appointment });
});

const update = asyncHandler(async (req, res) => {
  const existing = await Appointment.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
    ...own(req),
  });
  if (!existing) fail(res, 404, "Appointment not found");
  const body = pick(req.body, FIELDS);
  if (req.ownDoctorId) delete body.doctorId; // ...and can't hand the visit to someone else
  // Status-only edits (complete/cancel/no-show) must not be blocked by doctor state or slot rules.
  if (
    ["patientId", "doctorId", "scheduledAt", "type"].some(
      (k) => body[k] !== undefined,
    )
  ) {
    await prepare(req, res, body, existing);
  }

  if (body.status === "completed") body.completedAt = new Date();
  if (
    body.status === "cancelled" &&
    !body.cancelReason &&
    !existing.cancelReason
  )
    body.cancelReason = "Cancelled";

  // Moving a live visit: claim the new window first (throws 409 on overlap, leaving the old one intact).
  const moved = body.scheduledAt || body.doctorId || body.endsAt;
  const finalStatus = body.status || existing.status;
  const finalType = body.type || existing.type;
  if (moved && finalStatus === "scheduled" && finalType !== "walk_in") {
    const newDoctor = body.doctorId || existing.doctorId;
    if (String(newDoctor) !== String(existing.doctorId))
      await slotLock.release(existing._id); // locks are per doctor
    await slotLock.acquire({
      tenantId: req.tenantId,
      doctorId: newDoctor,
      appointmentId: existing._id,
      start: body.scheduledAt || existing.scheduledAt,
      end: body.endsAt || existing.endsAt,
    });
  }

  const wasCancelled = existing.status === "cancelled";
  existing.set(body);
  await existing.save();
  if (existing.status === "cancelled" && !wasCancelled)
    notifyAppointment("appointment_cancelled", existing._id);
  if (
    ["cancelled", "completed", "no_show"].includes(existing.status) ||
    existing.type === "walk_in"
  )
    await slotLock.release(existing._id);
  res.json({ success: true, data: existing });
});

// POST /:id/check-in — reception marks the patient as arrived.
const checkIn = asyncHandler(async (req, res) => {
  const appointment = await Appointment.findOneAndUpdate(
    {
      _id: req.params.id,
      tenantId: req.tenantId,
      status: "scheduled",
      ...own(req),
    },
    { checkedInAt: new Date() },
    { new: true },
  );
  if (!appointment) fail(res, 404, "Scheduled appointment not found");
  res.json({ success: true, data: appointment });
});

// GET /:id/video-link: same time window for staff and patients.
const videoLink = asyncHandler(async (req, res) => {
  const appt = await Appointment.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
    ...own(req),
  }).select("+videoRoom");
  if (!appt) fail(res, 404, "Appointment not found");
  const w = joinWindow(appt);
  if (!w.ok) fail(res, 409, w.reason);
  res.json({ success: true, data: { url: linkFor(appt.videoRoom) } });
});

const remove = asyncHandler(async (req, res) => {
  const appointment = await Appointment.findOneAndDelete({
    _id: req.params.id,
    tenantId: req.tenantId,
    ...own(req),
  });
  if (!appointment) fail(res, 404, "Appointment not found");
  await slotLock.release(appointment._id);
  res.json({ success: true, data: {} });
});

module.exports = {
  getAll,
  getOne,
  create,
  update,
  remove,
  checkIn,
  freeSlots,
  prepare,
  videoLink,
  book,
};
