const asyncHandler = require("express-async-handler");
const Tenant = require("../models/Tenant");
const MessageLog = require("../models/MessageLog");
const { TEMPLATES, BY_KEY, render } = require("../utils/whatsappTemplates");
const { isConnected } = require("../utils/whatsapp");

const SAMPLE = {
  patient: "Asha Verma",
  doctor: "Dr. Rajesh Kulkarni",
  date: "Fri, 16 Oct 2026",
  time: "11:30 AM",
  clinic: "Your Clinic",
  amount: "500.00",
  reference: "pay_Abc123",
  invoice: "INV-2026-00007",
  due: "23 Oct 2026",
  order: "LAB-2026-00012",
  link: "https://meet.jit.si/room",
};

const view = async (tenantId) => {
  const t = await Tenant.findById(tenantId).select("whatsapp");
  const off = new Set(t?.whatsapp?.disabledTemplates || []);
  return {
    enabled: !!t?.whatsapp?.enabled,
    connected: isConnected(),
    templates: TEMPLATES.map((x) => ({
      key: x.key,
      name: x.name,
      title: x.title,
      category: x.category,
      trigger: x.trigger,
      vars: x.vars,
      body: x.body,
      preview: render(x.key, SAMPLE),
      enabled: !off.has(x.key),
    })),
  };
};

const get = asyncHandler(async (req, res) =>
  res.json({ success: true, data: await view(req.tenantId) }),
);

const update = asyncHandler(async (req, res) => {
  const set = {};
  if (typeof req.body.enabled === "boolean")
    set["whatsapp.enabled"] = req.body.enabled;
  if (Array.isArray(req.body.disabledTemplates))
    set["whatsapp.disabledTemplates"] = [
      ...new Set(
        req.body.disabledTemplates.map(String).filter((k) => BY_KEY[k]),
      ),
    ];
  await Tenant.updateOne({ _id: req.tenantId }, { $set: set });
  res.json({ success: true, data: await view(req.tenantId) });
});

const log = asyncHandler(async (req, res) => {
  const data = await MessageLog.find({ tenantId: req.tenantId })
    .select("template to status reason createdAt")
    .sort({ createdAt: -1 })
    .limit(50);
  res.json({ success: true, count: data.length, data });
});

module.exports = { get, update, log };
