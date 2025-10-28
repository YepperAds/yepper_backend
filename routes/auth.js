const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const { Resend } = require('resend');

// IMPORTANT: Move this to .env file!
const resend = new Resend(process.env.RESEND_API_KEY);

// Email validation helper
const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

// Send email helper with error handling
const sendEmail = async ({ to, subject, text }) => {
    try {
        const response = await resend.emails.send({
            from: process.env.EMAIL_FROM || 'noreply@yepper.cc',
            to,
            subject,
            text,
        });
        console.log('Email sent successfully:', response.id);
        return { success: true, id: response.id };
    } catch (err) {
        console.error('Error sending email:', err);
        return { success: false, error: err.message };
    }
};

// Forgot Password Route - with 60 second cooldown
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;

    // Validate input
    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
    }

    try {
        const user = await User.findOne({ email: email.toLowerCase().trim() });
        
        // Security: Don't reveal if user exists or not
        // But we still send response after processing
        if (!user) {
            // Return success even if user doesn't exist (security best practice)
            return res.json({ 
                message: 'If an account exists with this email, a password reset link has been sent.' 
            });
        }

        // Check if token exists and is still valid
        if (user.resetPasswordToken && user.resetPasswordExpires > Date.now()) {
            // Check 60-second cooldown
            const tokenAge = Date.now() - (user.resetPasswordExpires - 3600000); // 3600000ms = 1 hour
            const cooldownPeriod = 60000; // 60 seconds in milliseconds
            
            if (tokenAge < cooldownPeriod) {
                const remainingTime = Math.ceil((cooldownPeriod - tokenAge) / 1000);
                return res.status(429).json({ 
                    error: `Please wait ${remainingTime} seconds before requesting another reset link.`,
                    remainingSeconds: remainingTime
                });
            }
        }

        // Generate new reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour from now
        await user.save();

        // Send reset email
        const resetUrl = `${process.env.FRONTEND_URL || 'https://yepper.cc'}/reset-password/${resetToken}`;
        const emailResult = await sendEmail({ 
            to: email, 
            subject: 'Password Reset Request', 
            text: `You requested a password reset. Click here to reset your password: ${resetUrl}\n\nThis link will expire in 1 hour.\n\nIf you didn't request this, please ignore this email.` 
        });

        if (!emailResult.success) {
            return res.status(500).json({ error: 'Failed to send reset email. Please try again.' });
        }

        res.json({ 
            message: 'Password reset link sent to your email. Please check your inbox.' 
        });

    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ error: 'Server error. Please try again later.' });
    }
});

// Reset Password Route
router.post('/reset-password/:token', async (req, res) => {
    const { token } = req.params;
    const { password } = req.body;

    // Validate input
    if (!password) {
        return res.status(400).json({ error: 'Password is required' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    try {
        // Find user with valid token
        const user = await User.findOne({ 
            resetPasswordToken: token, 
            resetPasswordExpires: { $gt: Date.now() } 
        });

        if (!user) {
            return res.status(400).json({ 
                error: 'Invalid or expired reset link. Please request a new one.' 
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Update user
        user.password = hashedPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        // Optional: Send confirmation email
        await sendEmail({
            to: user.email,
            subject: 'Password Reset Successful',
            text: 'Your password has been successfully reset. If you did not make this change, please contact support immediately.'
        });

        res.json({ 
            message: 'Password successfully reset. You can now log in with your new password.' 
        });

    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ error: 'Server error. Please try again later.' });
    }
});

module.exports = router;
