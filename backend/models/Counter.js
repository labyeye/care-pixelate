const mongoose = require("mongoose");

// Atomic sequences (invoice numbers): `findOneAndUpdate({_id}, {$inc:{seq:1}})` can't hand out the same number twice,
// unlike `countDocuments() + 1`.
const counterSchema = new mongoose.Schema({ _id: { type: String, required: true }, seq: { type: Number, default: 0 } });

counterSchema.statics.next = async function (name, seedFrom) {
  // First use: start after whatever already exists so new numbers never collide with old invoices.
  await this.updateOne({ _id: name }, { $setOnInsert: { seq: seedFrom ? await seedFrom() : 0 } }, { upsert: true });
  const doc = await this.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { new: true });
  return doc.seq;
};

module.exports = mongoose.model("Counter", counterSchema);
