const mongoose = require('mongoose');

const ProviderPriceOverrideSchema = new mongoose.Schema({
  provider: {
    type: String,
    required: true,
    lowercase: true,
    enum: ['openai', 'corelogic', 'attom', 'zillow', 'googlemaps', 'greatschools', 'sumsub', 'jumio', 'sendgrid', 'twilio']
  },
  
  // Override configurations
  overrides: {
    // For token-based providers (OpenAI)
    models: {
      type: Map,
      of: {
        input_cost_per_1k_tokens: { type: Number, min: 0 },
        output_cost_per_1k_tokens: { type: Number, min: 0 },
        original_input_cost: { type: Number },
        original_output_cost: { type: Number },
        discount_percentage: { type: Number, min: 0, max: 100 }
      }
    },
    
    // For per-call providers
    endpoints: {
      type: Map,
      of: {
        base_cost: { type: Number, min: 0 },
        original_cost: { type: Number },
        discount_percentage: { type: Number, min: 0, max: 100 }
      }
    },
    
    // For service-based providers
    services: {
      type: Map,
      of: {
        cost_per_verification: { type: Number, min: 0 },
        cost_per_email: { type: Number, min: 0 },
        cost_per_message: { type: Number, min: 0 },
        original_cost: { type: Number },
        discount_percentage: { type: Number, min: 0, max: 100 }
      }
    },
    
    // Volume tier overrides
    volume_tiers: [{
      min_calls: { type: Number, required: true, min: 0 },
      max_calls: { type: Number },
      multiplier: { type: Number, required: true, min: 0, max: 1 },
      original_multiplier: { type: Number }
    }]
  },
  
  // Negotiation details
  negotiation: {
    status: {
      type: String,
      enum: ['draft', 'proposed', 'negotiating', 'agreed', 'implemented', 'expired'],
      default: 'draft'
    },
    
    contract_type: {
      type: String,
      enum: ['monthly', 'annual', 'volume_commitment', 'enterprise'],
      default: 'monthly'
    },
    
    volume_commitment: {
      monthly_calls: { type: Number, min: 0 },
      annual_spend: { type: Number, min: 0 },
      penalty_clause: { type: String }
    },
    
    effective_date: { type: Date },
    expiry_date: { type: Date },
    
    terms: {
      payment_terms: { type: String }, // "Net 30", "Prepaid", etc.
      auto_renewal: { type: Boolean, default: false },
      cancellation_notice: { type: Number, default: 30 }, // days
      price_protection: { type: Boolean, default: false }
    },
    
    contact_info: {
      account_manager: { type: String },
      email: { type: String },
      phone: { type: String },
      last_contact: { type: Date }
    }
  },
  
  // Admin tracking
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  updated_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Approval workflow
  approval: {
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    approved_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    approved_at: { type: Date },
    rejection_reason: { type: String }
  },
  
  // Usage and impact tracking
  usage_tracking: {
    estimated_monthly_savings: { type: Number },
    estimated_annual_savings: { type: Number },
    break_even_volume: { type: Number },
    risk_assessment: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    }
  },
  
  // Audit trail
  audit_log: [{
    action: { type: String, required: true },
    changed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: Date.now },
    old_values: { type: mongoose.Schema.Types.Mixed },
    new_values: { type: mongoose.Schema.Types.Mixed },
    notes: { type: String }
  }],
  
  notes: { type: String },
  internal_notes: { type: String }, // Private admin notes
  
  is_active: { type: Boolean, default: false },
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
ProviderPriceOverrideSchema.index({ provider: 1, is_active: 1 });
ProviderPriceOverrideSchema.index({ 'negotiation.status': 1 });
ProviderPriceOverrideSchema.index({ 'approval.status': 1 });
ProviderPriceOverrideSchema.index({ created_by: 1 });

// Virtual for calculating total estimated impact
ProviderPriceOverrideSchema.virtual('estimated_impact').get(function() {
  return {
    monthly_savings: this.usage_tracking?.estimated_monthly_savings || 0,
    annual_savings: this.usage_tracking?.estimated_annual_savings || 0,
    status: this.negotiation?.status || 'draft'
  };
});

// Method to check if override is currently effective
ProviderPriceOverrideSchema.methods.isEffective = function() {
  const now = new Date();
  return this.is_active && 
         this.approval.status === 'approved' &&
         (!this.negotiation.effective_date || this.negotiation.effective_date <= now) &&
         (!this.negotiation.expiry_date || this.negotiation.expiry_date > now);
};

// Method to calculate savings compared to original pricing
ProviderPriceOverrideSchema.methods.calculateSavings = function(originalPricing, monthlyUsage) {
  if (!this.isEffective()) return { monthly: 0, annual: 0 };
  
  let monthlySavings = 0;
  
  // Calculate savings for different pricing models
  if (this.overrides.models && originalPricing.models) {
    // Token-based savings calculation
    for (const [model, override] of this.overrides.models.entries()) {
      const original = originalPricing.models[model];
      if (original && monthlyUsage[model]) {
        const originalCost = (monthlyUsage[model].input_tokens * original.input_cost_per_1k_tokens / 1000) +
                           (monthlyUsage[model].output_tokens * original.output_cost_per_1k_tokens / 1000);
        const overrideCost = (monthlyUsage[model].input_tokens * override.input_cost_per_1k_tokens / 1000) +
                           (monthlyUsage[model].output_tokens * override.output_cost_per_1k_tokens / 1000);
        monthlySavings += (originalCost - overrideCost);
      }
    }
  }
  
  if (this.overrides.endpoints && originalPricing.endpoints) {
    // Per-call savings calculation
    for (const [endpoint, override] of this.overrides.endpoints.entries()) {
      const original = originalPricing.endpoints[endpoint];
      if (original && monthlyUsage[endpoint]) {
        const originalCost = monthlyUsage[endpoint] * original.base_cost;
        const overrideCost = monthlyUsage[endpoint] * override.base_cost;
        monthlySavings += (originalCost - overrideCost);
      }
    }
  }
  
  return {
    monthly: Math.round(monthlySavings * 100) / 100,
    annual: Math.round(monthlySavings * 12 * 100) / 100
  };
};

// Static method to get active override for a provider
ProviderPriceOverrideSchema.statics.getActiveOverride = function(provider) {
  return this.findOne({
    provider: provider.toLowerCase(),
    is_active: true,
    'approval.status': 'approved'
  }).populate('created_by updated_by approval.approved_by', 'email firstName lastName');
};

// Pre-save middleware to update audit log
ProviderPriceOverrideSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.audit_log.push({
      action: 'updated',
      changed_by: this.updated_by,
      timestamp: new Date(),
      old_values: this._original,
      new_values: this.toObject(),
      notes: 'Override configuration updated'
    });
  }
  next();
});

module.exports = mongoose.model('ProviderPriceOverride', ProviderPriceOverrideSchema);
