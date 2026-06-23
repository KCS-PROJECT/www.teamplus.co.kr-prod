import 'package:flutter/material.dart';

/// TEAMPLUS App Color Palette
/// Following DESIGN_APP.md Professional Ice Hockey Theme
class AppColors {
  // Primary Colors (Deep Blue - Trust, Professional)
  static const Color primary =
      Color(0xFF1E40AF); // Ice Blue (matches --ice-primary)
  static const Color primaryLight =
      Color(0xFF60A5FA); // Light Blue (matches --ice-primary-light)
  static const Color accent =
      Color(0xFF22C55E); // Mint Green (matches --ice-accent)

  // Semantic Colors
  static const Color success = Color(0xFF22C55E); // Green - Approval, Check-in
  static const Color warning = Color(0xFFF59E0B); // Amber - Warnings, Credits
  static const Color error = Color(0xFFEF4444); // Red - Errors, Cancellations
  static const Color info = Color(0xFF1E40AF); // Blue - Information

  // Neutral Colors
  static const Color darkText = Color(0xFF0F172A); // slate-900
  static const Color lightText = Color(0xFF475569); // slate-600
  static const Color hintText = Color(0xFF64748B); // slate-500
  static const Color dividers = Color(0xFFE2E8F0); // slate-200
  static const Color background = Color(0xFFF8FAFC); // slate-50
  static const Color white = Color(0xFFFFFFFF);

  // Content Area Colors (Body와 동일 - UI 통일)
  static const Color contentBackground = Color(0xFFF8FAFC); // slate-50 (Light)
  static const Color contentBackgroundDark =
      Color(0xFF0F172A); // slate-900 (Dark)

  // Border Colors
  static const Color borderColor = Color(0xFFE2E8F0); // slate-200
  static const Color borderFocus = Color(0xFF1E40AF); // Primary focus

  // Badge Colors
  static const Color unreadBadge = Color(0xFFEF4444);
  static final Color unreadBadgeLight = unreadBadge.withValues(alpha: 0.12);

  // Notification Status
  static const Color notificationRead =
      Color(0xFFF1F5F9); // surface (slate-100)
  static final Color notificationUnread = primary.withValues(alpha: 0.08);

  // Card & Component Colors
  static const Color cardBackground = Color(0xFFFFFFFF);
  static const Color cardBorder = Color(0xFFE2E8F0);

  // Button Colors
  static const Color buttonPrimary = Color(0xFF1E40AF);
  static const Color buttonPrimaryHover = Color(0xFF1E3A8A);
  static const Color buttonSecondary = Color(0xFFF1F5F9);
  static const Color buttonSecondaryText = Color(0xFF0F172A);
  static const Color buttonDanger = Color(0xFFEF4444);
  static const Color buttonDangerHover = Color(0xFFDC2626);

  // Input Colors
  static const Color inputBorder = Color(0xFFE2E8F0);
  static const Color inputBorderFocus = Color(0xFF1E40AF);
  static const Color inputBorderError = Color(0xFFEF4444);
  static const Color inputBackground = Color(0xFFFFFFFF);

  // Shadow Colors
  static const Color shadow = Color(0x1A000000); // 10% black for box shadow

  // Dark Theme Colors (Professional Ice Hockey Theme)
  static const Color darkBackground = Color(0xFF0F172A); // slate-900
  static const Color darkSurface = Color(0xFF1E293B); // slate-800
  static const Color darkCard = Color(0xFF1E293B); // Elevated card background
  static const Color darkCardBorder = Color(0xFF334155); // slate-700
  static const Color darkInputBg = Color(0xFF1E293B); // Input field background
  static const Color darkInputBorder = Color(0xFF334155); // Input border
  static const Color darkDivider = Color(0xFF334155); // Divider lines
  static const Color darkTextPrimary = Color(0xFFF8FAFC); // slate-50
  static const Color darkTextSecondary = Color(0xFFCBD5E1); // slate-300
  static const Color darkTextMuted = Color(0xFF94A3B8); // slate-400
  static const Color darkAccent = Color(0xFF60A5FA); // Primary light
  static const Color darkAccentHover = Color(0xFF1E3A8A); // Primary dark
}
