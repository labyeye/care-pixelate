const mongoose = require("mongoose");

const availabilitySchema = new mongoose.Schema(
  {
    day: {
      type: String,
      enum: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      required: true,
    },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
  },
  { _id: false },
);

const doctorSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    doctorId: {
      type: String,
      required: true,
      trim: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    firstName: {
      type: String,
      required: true,
      trim: true,
    },

    middleName: {
      type: String,
      default: "",
      trim: true,
    },

    lastName: {
      type: String,
      required: true,
      trim: true,
    },

    profileImage: {
      type: String,
      default: "",
    },

    gender: {
      type: String,
      enum: ["male", "female", "other", "undisclosed"],
      default: "undisclosed",
    },

    dateOfBirth: {
      type: Date,
      default: null,
    },

    contact: {
      phone: { type: String, required: true, trim: true },
      email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
      },
    },

    professionalDetails: {
      registrationNumber: {
        type: String,
        required: true,
        trim: true,
      },

      registrationCouncil: {
        type: String,
        required: true,
        trim: true,
      },

      qualifications: [
        {
          degree: { type: String, required: true },
          institution: { type: String, default: "" },
          year: { type: Number, default: null },
        },
      ],

      specializations: [
        {
          type: String,
          trim: true,
        },
      ],

      experienceYears: {
        type: Number,
        min: 0,
        default: 0,
      },

      bio: {
        type: String,
        default: "",
      },

      languages: [
        {
          type: String,
        },
      ],
    },

    clinicIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Clinic",
      },
    ],

    departmentIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Department",
      },
    ],

    consultation: {
      consultationFee: {
        type: Number,
        min: 0,
        default: 0,
      },

      followUpFee: {
        type: Number,
        min: 0,
        default: 0,
      },

      currency: {
        type: String,
        default: "INR",
      },

      appointmentDurationMinutes: {
        type: Number,
        min: 5,
        default: 15,
      },

      consultationModes: [
        {
          type: String,
          enum: ["in_person", "video"],
        },
      ],

      acceptingAppointments: {
        type: Boolean,
        default: true,
      },
    },

    // --- Additions beyond the base schema: practice address, and the booking engine (utils/slots.js,
    // appointmentController, patient portal) needs a weekly schedule + leave days.
    address: {
      street: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      pincode: { type: String, default: "" },
      country: { type: String, default: "India" },
    },
    availability: { type: [availabilitySchema], default: [] },
    leaveDates: { type: [String], default: [] }, // "YYYY-MM-DD", clinic-local
    followUpDays: { type: Number, default: 7, min: 0 },

    verificationStatus: {
      type: String,
      enum: ["pending", "verified", "rejected"],
      default: "pending",
    },

    verifiedAt: {
      type: Date,
      default: null,
    },

    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    accountStatus: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

doctorSchema.index({ tenantId: 1, doctorId: 1 }, { unique: true });

doctorSchema.index({
  tenantId: 1,
  "professionalDetails.registrationNumber": 1,
});

// Display name for lists / print-outs. Needs firstName + lastName in any `.select()`.
doctorSchema.virtual("name").get(function () {
  return [this.firstName, this.middleName, this.lastName]
    .filter(Boolean)
    .join(" ");
});

module.exports = mongoose.model("Doctor", doctorSchema);
