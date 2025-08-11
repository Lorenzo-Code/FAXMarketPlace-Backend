const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { verifyToken } = require('../middleware/auth');
const sumsubService = require('../services/sumsubService');

// ✅ Initialize KYC Process
router.post('/initialize', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    console.log('🔍 Looking for user ID:', userId);
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    // Check if KYC already in progress or completed
    if (user.kyc && user.kyc.status === 'approved') {
      return res.status(400).json({ 
        msg: 'KYC already completed',
        status: 'approved'
      });
    }

    // Create Sumsub applicant
    const applicantData = await sumsubService.createApplicant({
      userId: user._id.toString(),
      firstName: user.firstName,
      lastName: user.lastName,
      dateOfBirth: user.dateOfBirth || '1990-01-01', // Default if not provided
      country: user.address?.country || 'USA'
    });

    // Generate access token for frontend SDK
    const accessToken = await sumsubService.generateAccessToken(user._id.toString());

    // Update user KYC status
    user.kyc = {
      ...user.kyc,
      status: 'pending',
      applicantId: applicantData.id,
      submittedAt: new Date(),
      sumsubData: {
        applicantId: applicantData.id,
        externalUserId: user._id.toString()
      }
    };

    await user.save();

    console.log(`🎯 KYC initialized for user: ${user.email}`);

    res.json({
      success: true,
      msg: 'KYC process initialized',
      data: {
        applicantId: applicantData.id,
        accessToken: accessToken.token,
        userId: user._id,
        status: 'pending'
      }
    });

  } catch (error) {
    console.error('❌ KYC initialization error:', error);
    res.status(500).json({ 
      msg: 'Failed to initialize KYC process',
      error: error.message 
    });
  }
});

// ✅ Get KYC Status
router.get('/status', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    // If no KYC data, return not started
    if (!user.kyc || !user.kyc.applicantId) {
      return res.json({
        status: 'not_started',
        message: 'KYC process not started'
      });
    }

    // Get latest status from Sumsub
    let sumsubStatus = null;
    try {
      sumsubStatus = await sumsubService.getApplicantStatus(user.kyc.applicantId);
    } catch (error) {
      console.warn('⚠️ Could not fetch Sumsub status:', error.message);
    }

    // Prepare response
    const kycStatus = {
      status: user.kyc.status,
      applicantId: user.kyc.applicantId,
      submittedAt: user.kyc.submittedAt,
      reviewedAt: user.kyc.reviewedAt,
      rejectionReason: user.kyc.rejectionReason,
      riskScore: user.kyc.riskScore,
      complianceNotes: user.kyc.complianceNotes
    };

    // Include Sumsub status if available
    if (sumsubStatus) {
      kycStatus.sumsubStatus = {
        reviewStatus: sumsubStatus.reviewStatus,
        reviewResult: sumsubStatus.reviewResult,
        createdAt: sumsubStatus.createdAt
      };
    }

    res.json(kycStatus);

  } catch (error) {
    console.error('❌ Get KYC status error:', error);
    res.status(500).json({ 
      msg: 'Failed to get KYC status',
      error: error.message 
    });
  }
});

// ✅ Generate New Access Token (for frontend SDK refresh)
router.post('/access-token', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user || !user.kyc?.applicantId) {
      return res.status(400).json({ msg: 'KYC not initialized' });
    }

    const accessToken = await sumsubService.generateAccessToken(user._id.toString());

    res.json({
      success: true,
      accessToken: accessToken.token,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
    });

  } catch (error) {
    console.error('❌ Access token generation error:', error);
    res.status(500).json({ 
      msg: 'Failed to generate access token',
      error: error.message 
    });
  }
});

// ✅ Webhook Endpoint (for Sumsub notifications)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['x-signature'];
    const payload = req.body;

    // Verify webhook signature (if configured)
    if (!sumsubService.verifyWebhookSignature(payload, signature)) {
      return res.status(401).json({ msg: 'Invalid webhook signature' });
    }

    // Process webhook data
    const webhookData = sumsubService.processWebhook(JSON.parse(payload));
    
    if (!webhookData) {
      return res.status(200).json({ msg: 'Webhook type not processed' });
    }

    console.log('📨 Sumsub webhook received:', webhookData.type, webhookData.externalUserId);

    // Find user by externalUserId
    const user = await User.findById(webhookData.externalUserId);
    
    if (!user) {
      console.warn('⚠️ User not found for webhook:', webhookData.externalUserId);
      return res.status(200).json({ msg: 'User not found' });
    }

    // Update KYC status based on webhook
    const updateData = {
      'kyc.reviewedAt': new Date()
    };

    switch (webhookData.type) {
      case 'applicantReviewed':
        if (webhookData.reviewResult?.reviewAnswer === 'GREEN') {
          updateData['kyc.status'] = 'approved';
          updateData['kyc.riskScore'] = 'Low';
          console.log(`✅ KYC approved for user: ${user.email}`);
        } else if (webhookData.reviewResult?.reviewAnswer === 'RED') {
          updateData['kyc.status'] = 'rejected';
          updateData['kyc.rejectionReason'] = webhookData.reviewResult?.rejectLabels?.join(', ') || 'Failed verification';
          console.log(`❌ KYC rejected for user: ${user.email}`);
        }
        break;
        
      case 'applicantPending':
        updateData['kyc.status'] = 'pending';
        console.log(`⏳ KYC pending for user: ${user.email}`);
        break;
    }

    // Update user
    await User.findByIdAndUpdate(webhookData.externalUserId, updateData);

    res.status(200).json({ msg: 'Webhook processed successfully' });

  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    res.status(500).json({ msg: 'Webhook processing failed' });
  }
});

// ✅ Manual Status Update (for testing/admin)
router.post('/update-status', verifyToken, async (req, res) => {
  try {
    const { applicantId } = req.body;
    const userId = req.user.id;
    
    if (!applicantId) {
      return res.status(400).json({ msg: 'Applicant ID required' });
    }

    // Get latest status from Sumsub
    const sumsubStatus = await sumsubService.getApplicantStatus(applicantId);
    
    // Update user based on Sumsub status
    const updateData = {
      'kyc.reviewedAt': new Date()
    };

    if (sumsubStatus.reviewResult?.reviewAnswer === 'GREEN') {
      updateData['kyc.status'] = 'approved';
      updateData['kyc.riskScore'] = 'Low';
    } else if (sumsubStatus.reviewResult?.reviewAnswer === 'RED') {
      updateData['kyc.status'] = 'rejected';
      updateData['kyc.rejectionReason'] = sumsubStatus.reviewResult?.rejectLabels?.join(', ') || 'Failed verification';
    } else {
      updateData['kyc.status'] = 'pending';
    }

    await User.findByIdAndUpdate(userId, updateData);

    res.json({
      success: true,
      msg: 'KYC status updated',
      status: updateData['kyc.status'],
      sumsubStatus
    });

  } catch (error) {
    console.error('❌ Manual status update error:', error);
    res.status(500).json({ 
      msg: 'Failed to update KYC status',
      error: error.message 
    });
  }
});

module.exports = router;
