import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/colors.dart';
import '../../../../shared/widgets/app_card.dart';
import '../../../../shared/widgets/teamplus_app_bar.dart';
import '../../data/class_dto.dart';
import '../providers/classes_provider.dart';
import 'class_detail_screen.dart';

class ClassListScreen extends ConsumerStatefulWidget {
  const ClassListScreen({super.key});

  @override
  ConsumerState<ClassListScreen> createState() => _ClassListScreenState();
}

class _ClassListScreenState extends ConsumerState<ClassListScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  /// ClassDto → ClassDetailScreen이 요구하는 Map 형태로 변환
  Map<String, dynamic> _toDetailMap(ClassDto c) => {
        'id': c.id,
        'name': c.className,
        'schedule': c.scheduleLabel,
        'coach': c.instructorName,
        'price': '요금 문의',
        'sessions': c.ageRangeLabel,
        'ageRange': c.ageRangeLabel,
        'capacity': c.capacity,
        'enrolled': c.enrolledCount,
        'description': c.description ?? '',
      };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: TeamplusAppBar(
        title: '수업 목록',
        backgroundColor: AppColors.white,
        foregroundColor: AppColors.darkText,
        bottom: TabBar(
          controller: _tabController,
          labelColor: AppColors.primary,
          unselectedLabelColor: AppColors.lightText,
          indicatorColor: AppColors.primary,
          tabs: const [
            Tab(text: '수업 목록'),
            Tab(text: '일정'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildClassList(),
          _buildSchedule(),
        ],
      ),
    );
  }

  Widget _buildClassList() {
    final classesAsync = ref.watch(classesListProvider);

    return classesAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => _buildErrorState(),
      data: (classes) {
        if (classes.isEmpty) return _buildEmptyState();
        return RefreshIndicator(
          onRefresh: () async => ref.invalidate(classesListProvider),
          child: ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: classes.length,
            itemBuilder: (context, index) {
              final c = classes[index];
              return Padding(
                padding: EdgeInsets.only(
                  bottom: index < classes.length - 1 ? 12 : 0,
                ),
                child: ClassCard(
                  className: c.className,
                  schedule: c.scheduleLabel,
                  coach: c.instructorName,
                  price: c.availabilityLabel,
                  sessionsInfo: c.ageRangeLabel,
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (context) => ClassDetailScreen(
                          classData: _toDetailMap(c),
                        ),
                      ),
                    );
                  },
                ),
              );
            },
          ),
        );
      },
    );
  }

  Widget _buildEmptyState() {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.school_outlined, size: 64, color: AppColors.lightText),
          SizedBox(height: 16),
          Text(
            '등록된 수업이 없습니다',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: AppColors.darkText,
            ),
          ),
          SizedBox(height: 8),
          Text(
            '현재 진행 중인 수업이 없습니다',
            style: TextStyle(fontSize: 14, color: AppColors.lightText),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline, size: 48, color: AppColors.error),
          const SizedBox(height: 12),
          const Text('수업 목록을 불러올 수 없습니다.'),
          const SizedBox(height: 16),
          TextButton(
            onPressed: () => ref.invalidate(classesListProvider),
            child: const Text('다시 시도'),
          ),
        ],
      ),
    );
  }

  Widget _buildSchedule() {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.calendar_today,
            size: 64,
            color: AppColors.lightText,
          ),
          SizedBox(height: 16),
          Text(
            '일정 뷰는 준비 중입니다',
            style: TextStyle(
              fontSize: 16,
              color: AppColors.lightText,
            ),
          ),
        ],
      ),
    );
  }
}
