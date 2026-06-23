import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/theme/colors.dart';

/// 사용자 타입 열거형
enum UserType {
  parent,
  coach,
  child,
  teen,
  admin,
  director,
}

/// 네비게이션 아이템 모델
class NavItem {
  final String href;
  final IconData icon;
  final IconData? activeIcon;
  final String label;

  const NavItem({
    required this.href,
    required this.icon,
    this.activeIcon,
    required this.label,
  });
}

/// TEAMPLUS BottomNav - "Nordic Ice" Design
///
/// Design Features:
/// - Floating dock with elegant rounded corners
/// - Pill-shaped active indicator with smooth sliding
/// - Ice-skating glide animations on tab transitions
/// - Icon morphing (outline → filled) with scale effects
/// - Staggered reveal animations on state changes
/// - Refined notification badges with pulse effect
///
/// 웹의 BottomNav와 동일한 디자인 시스템 적용
class TeamplusBottomNav extends StatefulWidget {
  final UserType userType;
  final int currentIndex;
  final Function(int index, String href) onTap;
  final Color? backgroundColor;
  final Color? selectedItemColor;
  final Color? unselectedItemColor;
  final int? notificationCount;

  const TeamplusBottomNav({
    super.key,
    required this.userType,
    required this.currentIndex,
    required this.onTap,
    this.backgroundColor,
    this.selectedItemColor,
    this.unselectedItemColor,
    this.notificationCount,
  });

  /// 사용자 타입별 네비게이션 아이템 반환
  List<NavItem> get navItems {
    switch (userType) {
      case UserType.parent:
        return const [
          NavItem(href: '/classes', icon: Icons.sports_hockey, label: '수업'),
          NavItem(
              href: '/calendar',
              icon: Icons.calendar_today_outlined,
              activeIcon: Icons.calendar_today,
              label: '일정'),
          NavItem(
              href: '/parent',
              icon: Icons.home_outlined,
              activeIcon: Icons.home_rounded,
              label: '홈'),
          NavItem(
              href: '/notifications',
              icon: Icons.notifications_outlined,
              activeIcon: Icons.notifications_rounded,
              label: '알림'),
          NavItem(
              href: '/mypage',
              icon: Icons.person_outline_rounded,
              activeIcon: Icons.person_rounded,
              label: '마이'),
        ];
      case UserType.coach:
        return const [
          NavItem(
              href: '/calendar',
              icon: Icons.calendar_today_outlined,
              activeIcon: Icons.calendar_today,
              label: '일정'),
          NavItem(
              href: '/coach-members',
              icon: Icons.groups_outlined,
              activeIcon: Icons.groups_rounded,
              label: '회원'),
          NavItem(
              href: '/coach',
              icon: Icons.home_outlined,
              activeIcon: Icons.home_rounded,
              label: '홈'),
          NavItem(
              href: '/messages',
              icon: Icons.chat_bubble_outline_rounded,
              activeIcon: Icons.chat_bubble_rounded,
              label: '채팅'),
          NavItem(
              href: '/mypage',
              icon: Icons.person_outline_rounded,
              activeIcon: Icons.person_rounded,
              label: '프로필'),
        ];
      case UserType.child:
        return const [
          NavItem(
              href: '/schedule',
              icon: Icons.calendar_month_outlined,
              activeIcon: Icons.calendar_month_rounded,
              label: '일정'),
          NavItem(href: '/classes', icon: Icons.sports_hockey, label: '수업'),
          NavItem(
              href: '/child',
              icon: Icons.home_outlined,
              activeIcon: Icons.home_rounded,
              label: '홈'),
          NavItem(
              href: '/badges',
              icon: Icons.emoji_events_outlined,
              activeIcon: Icons.emoji_events_rounded,
              label: '뱃지'),
          NavItem(
              href: '/mypage',
              icon: Icons.person_outline_rounded,
              activeIcon: Icons.person_rounded,
              label: '내 정보'),
        ];
      case UserType.teen:
        return const [
          NavItem(href: '/classes', icon: Icons.sports_hockey, label: '수업'),
          NavItem(
              href: '/matches/list',
              icon: Icons.groups_outlined,
              activeIcon: Icons.groups_rounded,
              label: '매치'),
          NavItem(
              href: '/teen',
              icon: Icons.home_outlined,
              activeIcon: Icons.home_rounded,
              label: '홈'),
          NavItem(
              href: '/notifications',
              icon: Icons.notifications_outlined,
              activeIcon: Icons.notifications_rounded,
              label: '알림'),
          NavItem(
              href: '/mypage',
              icon: Icons.person_outline_rounded,
              activeIcon: Icons.person_rounded,
              label: '마이'),
        ];
      case UserType.admin:
        return const [
          NavItem(
              href: '/members',
              icon: Icons.groups_outlined,
              activeIcon: Icons.groups_rounded,
              label: '회원'),
          NavItem(
              href: '/settlements',
              icon: Icons.bar_chart_outlined,
              activeIcon: Icons.bar_chart_rounded,
              label: '통계'),
          NavItem(
              href: '/admin',
              icon: Icons.home_outlined,
              activeIcon: Icons.home_rounded,
              label: '홈'),
          NavItem(
              href: '/notifications',
              icon: Icons.notifications_outlined,
              activeIcon: Icons.notifications_rounded,
              label: '알림'),
          NavItem(
              href: '/settings',
              icon: Icons.settings_outlined,
              activeIcon: Icons.settings_rounded,
              label: '설정'),
        ];
      case UserType.director:
        return const [
          NavItem(
              href: '/director-schedules',
              icon: Icons.calendar_today_outlined,
              activeIcon: Icons.calendar_today,
              label: '일정'),
          NavItem(
              href: '/team',
              icon: Icons.groups_outlined,
              activeIcon: Icons.groups_rounded,
              label: '팀원'),
          NavItem(
              href: '/director',
              icon: Icons.home_outlined,
              activeIcon: Icons.home_rounded,
              label: '홈'),
          NavItem(
              href: '/notifications',
              icon: Icons.notifications_outlined,
              activeIcon: Icons.notifications_rounded,
              label: '알림'),
          NavItem(
              href: '/settings',
              icon: Icons.settings_outlined,
              activeIcon: Icons.settings_rounded,
              label: '설정'),
        ];
    }
  }

  /// 사용자 타입별 홈 경로 반환
  String get homeHref {
    switch (userType) {
      case UserType.parent:
        return '/parent';
      case UserType.coach:
        return '/coach';
      case UserType.child:
        return '/child';
      case UserType.teen:
        return '/teen';
      case UserType.admin:
        return '/admin';
      case UserType.director:
        return '/director';
    }
  }

  @override
  State<TeamplusBottomNav> createState() => _TeamplusBottomNavState();

  /// 문자열에서 UserType 변환
  static UserType? fromString(String? type) {
    if (type == null) return null;

    final normalizedType = type.toLowerCase();
    switch (normalizedType) {
      case 'parent':
        return UserType.parent;
      case 'coach':
        return UserType.coach;
      case 'child':
        return UserType.child;
      case 'teen':
        return UserType.teen;
      case 'admin':
        return UserType.admin;
      case 'director':
        return UserType.director;
      default:
        return null;
    }
  }

  /// URL 경로에서 현재 인덱스 찾기
  static int findIndexByPath(List<NavItem> items, String? currentPath) {
    if (currentPath == null) return 2; // 기본값: 홈 (중앙)

    for (int i = 0; i < items.length; i++) {
      if (currentPath.startsWith(items[i].href)) {
        return i;
      }
    }

    return 2; // 기본값: 홈 (중앙)
  }
}

class _TeamplusBottomNavState extends State<TeamplusBottomNav>
    with TickerProviderStateMixin {
  // 탭 터치 애니메이션
  late List<AnimationController> _tapControllers;
  late List<Animation<double>> _tapAnimations;

  // 슬라이딩 인디케이터 - Ice Glide 효과
  late AnimationController _slideController;
  late Animation<double> _slideAnimation;

  // 아이콘 전환 애니메이션 (staggered)
  late List<AnimationController> _iconControllers;
  late List<Animation<double>> _iconScaleAnimations;
  late List<Animation<double>> _iconRotateAnimations;

  @override
  void initState() {
    super.initState();
    _initAllAnimations();
  }

  void _initAllAnimations() {
    final items = widget.navItems;

    // 탭 터치 스케일 애니메이션
    _tapControllers = List.generate(
      items.length,
      (index) => AnimationController(
        duration: const Duration(milliseconds: 100),
        vsync: this,
      ),
    );

    _tapAnimations = _tapControllers.map((controller) {
      return Tween<double>(begin: 1.0, end: 0.92).animate(
        CurvedAnimation(parent: controller, curve: Curves.easeOutCubic),
      );
    }).toList();

    // 슬라이딩 인디케이터 - 커스텀 Ice Glide Curve
    _slideController = AnimationController(
      duration: const Duration(milliseconds: 400),
      vsync: this,
    );

    _slideAnimation = Tween<double>(
      begin: widget.currentIndex.toDouble(),
      end: widget.currentIndex.toDouble(),
    ).animate(CurvedAnimation(
      parent: _slideController,
      curve: const _IceGlideCurve(),
    ));

    // 아이콘 전환 애니메이션 (staggered reveal)
    _iconControllers = List.generate(
      items.length,
      (index) => AnimationController(
        duration: const Duration(milliseconds: 300),
        vsync: this,
      ),
    );

    _iconScaleAnimations = _iconControllers.map((controller) {
      return TweenSequence<double>([
        TweenSequenceItem(
          tween: Tween<double>(begin: 1.0, end: 1.15)
              .chain(CurveTween(curve: Curves.easeOut)),
          weight: 50,
        ),
        TweenSequenceItem(
          tween: Tween<double>(begin: 1.15, end: 1.0)
              .chain(CurveTween(curve: Curves.elasticOut)),
          weight: 50,
        ),
      ]).animate(controller);
    }).toList();

    _iconRotateAnimations = _iconControllers.map((controller) {
      return TweenSequence<double>([
        TweenSequenceItem(
          tween: Tween<double>(begin: 0.0, end: -0.03)
              .chain(CurveTween(curve: Curves.easeOut)),
          weight: 30,
        ),
        TweenSequenceItem(
          tween: Tween<double>(begin: -0.03, end: 0.03)
              .chain(CurveTween(curve: Curves.easeInOut)),
          weight: 40,
        ),
        TweenSequenceItem(
          tween: Tween<double>(begin: 0.03, end: 0.0)
              .chain(CurveTween(curve: Curves.elasticOut)),
          weight: 30,
        ),
      ]).animate(controller);
    }).toList();

    // 초기 활성 탭 애니메이션 실행
    if (widget.currentIndex < _iconControllers.length) {
      _iconControllers[widget.currentIndex].forward();
    }
  }

  @override
  void didUpdateWidget(TeamplusBottomNav oldWidget) {
    super.didUpdateWidget(oldWidget);

    if (oldWidget.userType != widget.userType) {
      _disposeAllAnimations();
      _initAllAnimations();
    }

    if (oldWidget.currentIndex != widget.currentIndex) {
      _animateTransition(oldWidget.currentIndex, widget.currentIndex);
    }
  }

  void _animateTransition(int from, int to) {
    // 슬라이드 애니메이션
    _slideAnimation = Tween<double>(
      begin: from.toDouble(),
      end: to.toDouble(),
    ).animate(CurvedAnimation(
      parent: _slideController,
      curve: const _IceGlideCurve(),
    ));
    _slideController.forward(from: 0.0);

    // 이전 아이콘 축소
    if (from < _iconControllers.length) {
      _iconControllers[from].reverse();
    }

    // 새 아이콘 확대 (약간의 딜레이로 staggered 효과)
    Future.delayed(const Duration(milliseconds: 80), () {
      if (mounted && to < _iconControllers.length) {
        _iconControllers[to].forward();
      }
    });
  }

  void _disposeAllAnimations() {
    for (var controller in _tapControllers) {
      controller.dispose();
    }
    for (var controller in _iconControllers) {
      controller.dispose();
    }
    _slideController.dispose();
  }

  @override
  void dispose() {
    _disposeAllAnimations();
    super.dispose();
  }

  void _onTapDown(int index) {
    if (index < _tapControllers.length) {
      _tapControllers[index].forward();
      HapticFeedback.lightImpact();
    }
  }

  void _onTapUp(int index) {
    if (index < _tapControllers.length) {
      _tapControllers[index].reverse();
    }
  }

  void _onTapCancel(int index) {
    if (index < _tapControllers.length) {
      _tapControllers[index].reverse();
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = widget.navItems;
    final isDarkMode = Theme.of(context).brightness == Brightness.dark;

    // Colors
    final bgColor = widget.backgroundColor ??
        (isDarkMode ? const Color(0xFF0F172A) : Colors.white);
    final selectedColor = widget.selectedItemColor ?? AppColors.primary;
    final unselectedColor = widget.unselectedItemColor ??
        (isDarkMode ? const Color(0xFF64748B) : const Color(0xFF94A3B8));

    // Border color
    final borderColor = isDarkMode
        ? const Color.fromRGBO(255, 255, 255, 0.08)
        : const Color.fromRGBO(0, 0, 0, 0.08);

    return Container(
      // Outer container for floating effect
      padding: EdgeInsets.only(
        left: 12,
        right: 12,
        bottom: MediaQuery.of(context).padding.bottom + 8,
      ),
      child: Container(
        height: 68,
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: borderColor, width: 1),
          // Layered shadow for depth
          boxShadow: [
            BoxShadow(
              color: Color.fromRGBO(0, 0, 0, isDarkMode ? 0.3 : 0.08),
              blurRadius: 24,
              offset: const Offset(0, 4),
              spreadRadius: -4,
            ),
            BoxShadow(
              color: Color.fromRGBO(0, 0, 0, isDarkMode ? 0.1 : 0.02),
              blurRadius: 1,
              offset: Offset.zero,
            ),
          ],
        ),
        child: LayoutBuilder(
          builder: (context, constraints) {
            final itemWidth = constraints.maxWidth / items.length;

            return Stack(
              children: [
                // 슬라이딩 인디케이터 (배경 pill)
                AnimatedBuilder(
                  animation: _slideAnimation,
                  builder: (context, child) {
                    return Positioned(
                      left: _slideAnimation.value * itemWidth + 4,
                      top: 6,
                      bottom: 6,
                      width: itemWidth - 8,
                      child: Container(
                        decoration: BoxDecoration(
                          color: selectedColor.withValues(
                            alpha: isDarkMode ? 0.15 : 0.1,
                          ),
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                    );
                  },
                ),

                // 네비게이션 아이템들
                Row(
                  children: List.generate(items.length, (index) {
                    final item = items[index];
                    final isActive = index == widget.currentIndex;
                    final isNotification = item.href == '/notifications';
                    final showBadge = isNotification &&
                        widget.notificationCount != null &&
                        widget.notificationCount! > 0;

                    return Expanded(
                      child: GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTapDown: (_) => _onTapDown(index),
                        onTapUp: (_) {
                          _onTapUp(index);
                          if (!isActive) {
                            widget.onTap(index, item.href);
                          }
                        },
                        onTapCancel: () => _onTapCancel(index),
                        child: AnimatedBuilder(
                          animation: _tapAnimations[index],
                          builder: (context, child) {
                            return Transform.scale(
                              scale: _tapAnimations[index].value,
                              child: child,
                            );
                          },
                          child: _NavItemWidget(
                            item: item,
                            isActive: isActive,
                            selectedColor: selectedColor,
                            unselectedColor: unselectedColor,
                            showBadge: showBadge,
                            badgeCount: widget.notificationCount,
                            isDarkMode: isDarkMode,
                            scaleAnimation: _iconScaleAnimations[index],
                            rotateAnimation: _iconRotateAnimations[index],
                          ),
                        ),
                      ),
                    );
                  }),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// Ice-skating glide curve: 빠르게 출발, 부드럽게 정지 (얼음 마찰 시뮬레이션)
class _IceGlideCurve extends Curve {
  const _IceGlideCurve();

  @override
  double transformInternal(double t) {
    // Custom bezier curve for ice-skating feel
    // 초반 급가속 + 후반 부드러운 감속
    return 1.0 - math.pow(1.0 - t, 3.5);
  }
}

/// 네비게이션 아이템 위젯
class _NavItemWidget extends StatelessWidget {
  final NavItem item;
  final bool isActive;
  final Color selectedColor;
  final Color unselectedColor;
  final bool showBadge;
  final int? badgeCount;
  final bool isDarkMode;
  final Animation<double> scaleAnimation;
  final Animation<double> rotateAnimation;

  const _NavItemWidget({
    required this.item,
    required this.isActive,
    required this.selectedColor,
    required this.unselectedColor,
    required this.showBadge,
    this.badgeCount,
    required this.isDarkMode,
    required this.scaleAnimation,
    required this.rotateAnimation,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // 아이콘 with 애니메이션
          Stack(
            clipBehavior: Clip.none,
            children: [
              AnimatedBuilder(
                animation: Listenable.merge([scaleAnimation, rotateAnimation]),
                builder: (context, child) {
                  return Transform(
                    alignment: Alignment.center,
                    transform: Matrix4.identity()
                      ..scaleByDouble(isActive ? scaleAnimation.value : 1.0,
                          isActive ? scaleAnimation.value : 1.0, 1.0, 1.0)
                      ..rotateZ(isActive ? rotateAnimation.value : 0.0),
                    child: child,
                  );
                },
                child: _AnimatedIcon(
                  item: item,
                  isActive: isActive,
                  selectedColor: selectedColor,
                  unselectedColor: unselectedColor,
                ),
              ),

              // 알림 뱃지
              if (showBadge)
                Positioned(
                  top: -6,
                  right: -10,
                  child: _NotificationBadge(
                    count: badgeCount ?? 0,
                    isDarkMode: isDarkMode,
                  ),
                ),
            ],
          ),

          const SizedBox(height: 4),

          // 레이블
          _AnimatedLabel(
            label: item.label,
            isActive: isActive,
            selectedColor: selectedColor,
            unselectedColor: unselectedColor,
          ),
        ],
      ),
    );
  }
}

/// 부드러운 아이콘 전환 애니메이션
class _AnimatedIcon extends StatelessWidget {
  final NavItem item;
  final bool isActive;
  final Color selectedColor;
  final Color unselectedColor;

  const _AnimatedIcon({
    required this.item,
    required this.isActive,
    required this.selectedColor,
    required this.unselectedColor,
  });

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween<double>(begin: 0.0, end: isActive ? 1.0 : 0.0),
      duration: const Duration(milliseconds: 250),
      curve: Curves.easeOutCubic,
      builder: (context, value, child) {
        // 아이콘 모핑: outline → filled
        final icon = value > 0.5 ? (item.activeIcon ?? item.icon) : item.icon;

        // 색상 보간
        final color = Color.lerp(unselectedColor, selectedColor, value)!;

        return Icon(
          icon,
          size: 24,
          color: color,
        );
      },
    );
  }
}

/// 부드러운 레이블 전환 애니메이션
class _AnimatedLabel extends StatelessWidget {
  final String label;
  final bool isActive;
  final Color selectedColor;
  final Color unselectedColor;

  const _AnimatedLabel({
    required this.label,
    required this.isActive,
    required this.selectedColor,
    required this.unselectedColor,
  });

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween<double>(begin: 0.0, end: isActive ? 1.0 : 0.0),
      duration: const Duration(milliseconds: 200),
      curve: Curves.easeOutCubic,
      builder: (context, value, child) {
        final color = Color.lerp(unselectedColor, selectedColor, value)!;
        final fontWeight = value > 0.5 ? FontWeight.w700 : FontWeight.w500;

        return Text(
          label,
          style: TextStyle(
            fontSize: 10,
            fontWeight: fontWeight,
            color: color,
            letterSpacing: -0.3,
            height: 1.2,
          ),
        );
      },
    );
  }
}

/// 알림 뱃지 with 펄스 애니메이션
class _NotificationBadge extends StatefulWidget {
  final int count;
  final bool isDarkMode;

  const _NotificationBadge({
    required this.count,
    required this.isDarkMode,
  });

  @override
  State<_NotificationBadge> createState() => _NotificationBadgeState();
}

class _NotificationBadgeState extends State<_NotificationBadge>
    with SingleTickerProviderStateMixin {
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      duration: const Duration(milliseconds: 2000),
      vsync: this,
    )..repeat(reverse: true);

    _pulseAnimation = Tween<double>(begin: 1.0, end: 1.12).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final displayText = widget.count > 99 ? '99+' : widget.count.toString();
    final ringColor =
        widget.isDarkMode ? const Color(0xFF0F172A) : Colors.white;

    return AnimatedBuilder(
      animation: _pulseAnimation,
      builder: (context, child) {
        return Transform.scale(
          scale: _pulseAnimation.value,
          child: child,
        );
      },
      child: Container(
        constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
        padding: const EdgeInsets.symmetric(horizontal: 5),
        decoration: BoxDecoration(
          color: const Color(0xFFF43F5E), // rose-500
          borderRadius: BorderRadius.circular(9),
          border: Border.all(color: ringColor, width: 2),
        ),
        child: Center(
          child: Text(
            displayText,
            style: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: Colors.white,
              height: 1.2,
            ),
          ),
        ),
      ),
    );
  }
}
