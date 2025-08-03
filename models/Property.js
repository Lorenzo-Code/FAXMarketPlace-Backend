const mongoose = require("mongoose");

const PropertySchema = new mongoose.Schema(
  {
    title: String,
    address1: String,
    city: String,
    state: String,
    price: Number,
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    // New fields
    isFractional: { type: Boolean, default: false },
    isAISuggested: { type: Boolean, default: false },
    expectedMonthlyROI: { type: Number, default: 0 }, // e.g. 6.5% = 0.065
    rentalYield: Number,
    type: { type: String, enum: ["rent", "sale"], default: "sale" }
  },
  { timestamps: true }
);


const handleStatusChange = async (propertyId, action) => {
  const token = localStorage.getItem("access_token");

  try {
    const response = await smartFetch(`/api/admin/properties/${propertyId}/${action}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.msg || "Action failed");

    fetchProperties(); // Refresh table
  } catch (err) {
    alert("⛔ " + err.message);
  }
};




module.exports = mongoose.model("Property", PropertySchema);
