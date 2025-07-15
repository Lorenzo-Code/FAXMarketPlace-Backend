const mongoose = require("mongoose");

const PropertySchema = new mongoose.Schema(
  {
    title: String,
    address: String,
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
