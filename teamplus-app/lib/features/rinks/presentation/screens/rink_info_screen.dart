import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../../core/theme/colors.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../shared/widgets/teamplus_app_bar.dart';

/// TEAMPLUS 구장 정보 화면
/// 참고: backdata/KakaoTalk_20250107_154545877.jpg (Alpha Asia 경쟁앱)
///
/// Design 7 Principles 적용:
/// 1. 화면 분석 필수 - 경쟁앱 구장 정보 구조 분석
/// 2. 휴먼 디자인 - 깔끔한 카드 레이아웃
/// 3. AI 스타일 절대 금지 - 그라데이션, blur 미사용
/// 4. 페르소나 융합 - frontend, architect, analyzer 협업
/// 5. 명령어 필수 - frontend-design 스킬 활용
/// 6. 결과 출력 필수 - 하단 주석 참조
/// 7. Tone & Manner - 존댓말, 전문적 표현
class RinkInfoScreen extends StatefulWidget {
  const RinkInfoScreen({super.key});

  @override
  State<RinkInfoScreen> createState() => _RinkInfoScreenState();
}

class _RinkInfoScreenState extends State<RinkInfoScreen> {
  // 지역 필터
  final List<String> _regions = ['전체', '서울', '경기', '인천', '강원'];
  int _selectedRegionIndex = 0;

  // 검색어
  String _searchQuery = '';
  final TextEditingController _searchController = TextEditingController();

  // 샘플 링크 데이터
  final List<Rink> _rinks = [
    Rink(
      id: '1',
      name: '목동 아이스링크',
      region: '서울',
      address: '서울특별시 양천구 목동동로 99',
      phone: '02-2649-0990',
      operatingHours: '06:00 - 22:00',
      rinkSize: '60m x 30m (국제규격)',
      facilities: ['관람석 3,500석', '매점', '장비대여', '스케이트샵', '주차장'],
      imageUrl: null,
      latitude: 37.5285,
      longitude: 126.8756,
      priceInfo: '일반 15,000원 / 청소년 12,000원',
      isFavorite: true,
      rating: 4.5,
      reviewCount: 128,
    ),
    Rink(
      id: '2',
      name: '태릉 국제스케이트장',
      region: '서울',
      address: '서울특별시 노원구 화랑로 727',
      phone: '02-970-9263',
      operatingHours: '10:00 - 18:00',
      rinkSize: '60m x 30m (국제규격)',
      facilities: ['관람석 2,000석', '매점', '장비대여', '주차장'],
      imageUrl: null,
      latitude: 37.6181,
      longitude: 127.0844,
      priceInfo: '일반 10,000원 / 청소년 8,000원',
      isFavorite: false,
      rating: 4.2,
      reviewCount: 85,
    ),
    Rink(
      id: '3',
      name: '고양 어울림누리 빙상장',
      region: '경기',
      address: '경기도 고양시 일산동구 중앙로 1286',
      phone: '031-960-9600',
      operatingHours: '06:00 - 22:00',
      rinkSize: '56m x 26m',
      facilities: ['관람석 1,500석', '매점', '장비대여', '무료주차'],
      imageUrl: null,
      latitude: 37.6721,
      longitude: 126.7521,
      priceInfo: '일반 8,000원 / 청소년 6,000원',
      isFavorite: true,
      rating: 4.3,
      reviewCount: 62,
    ),
    Rink(
      id: '4',
      name: '의정부 실내빙상장',
      region: '경기',
      address: '경기도 의정부시 체육로 90',
      phone: '031-870-2600',
      operatingHours: '06:00 - 21:00',
      rinkSize: '60m x 30m (국제규격)',
      facilities: ['관람석 3,000석', '매점', '장비대여', '주차장', '헬스장'],
      imageUrl: null,
      latitude: 37.7408,
      longitude: 127.0499,
      priceInfo: '일반 7,000원 / 청소년 5,000원',
      isFavorite: false,
      rating: 4.4,
      reviewCount: 94,
    ),
    Rink(
      id: '5',
      name: '인천 선학 국제빙상경기장',
      region: '인천',
      address: '인천광역시 연수구 인천타워대로 246',
      phone: '032-899-5700',
      operatingHours: '06:00 - 22:00',
      rinkSize: '60m x 30m (국제규격)',
      facilities: ['관람석 5,500석', '매점', '장비대여', '프로샵', '대형주차장'],
      imageUrl: null,
      latitude: 37.4130,
      longitude: 126.6959,
      priceInfo: '일반 10,000원 / 청소년 8,000원',
      isFavorite: false,
      rating: 4.6,
      reviewCount: 156,
    ),
    Rink(
      id: '6',
      name: '강릉 아이스아레나',
      region: '강원',
      address: '강원특별자치도 강릉시 종합운동장길 32',
      phone: '033-660-3110',
      operatingHours: '09:00 - 18:00',
      rinkSize: '60m x 30m (국제규격)',
      facilities: ['관람석 6,000석', '매점', '장비대여', '스케이트아카데미'],
      imageUrl: null,
      latitude: 37.7689,
      longitude: 128.8960,
      priceInfo: '일반 12,000원 / 청소년 9,000원',
      isFavorite: false,
      rating: 4.8,
      reviewCount: 203,
    ),
  ];

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  List<Rink> get _filteredRinks {
    var list = _rinks;

    // 지역 필터
    if (_selectedRegionIndex > 0) {
      list = list
          .where((r) => r.region == _regions[_selectedRegionIndex])
          .toList();
    }

    // 검색 필터
    if (_searchQuery.isNotEmpty) {
      list = list
          .where((r) =>
              r.name.toLowerCase().contains(_searchQuery.toLowerCase()) ||
              r.address.toLowerCase().contains(_searchQuery.toLowerCase()))
          .toList();
    }

    return list;
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark.copyWith(
        statusBarColor: Colors.transparent,
      ),
      child: Scaffold(
        backgroundColor: AppColors.background,
        appBar: _buildAppBar(),
        body: Column(
          children: [
            // 검색 바
            _buildSearchBar(),

            // 지역 필터
            _buildRegionFilter(),

            // 링크 목록
            Expanded(
              child: _buildRinkList(),
            ),
          ],
        ),
      ),
    );
  }

  PreferredSizeWidget _buildAppBar() {
    return TeamplusAppBar(
      title: '구장 정보',
      backgroundColor: AppColors.white,
      foregroundColor: AppColors.darkText,
      actions: [
        IconButton(
          onPressed: () {
            // 지도 보기
          },
          icon: const Icon(
            Icons.map_outlined,
            color: AppColors.darkText,
            size: 24,
          ),
        ),
        const SizedBox(width: 8),
      ],
    );
  }

  Widget _buildSearchBar() {
    return Container(
      padding: const EdgeInsets.all(AppTheme.spacingMD),
      color: AppColors.white,
      child: TextField(
        controller: _searchController,
        onChanged: (value) {
          setState(() {
            _searchQuery = value;
          });
        },
        decoration: InputDecoration(
          hintText: '구장명 또는 주소로 검색',
          hintStyle: const TextStyle(
            fontSize: 14,
            color: AppColors.lightText,
          ),
          prefixIcon: const Icon(
            Icons.search,
            color: AppColors.lightText,
            size: 20,
          ),
          suffixIcon: _searchQuery.isNotEmpty
              ? IconButton(
                  onPressed: () {
                    setState(() {
                      _searchController.clear();
                      _searchQuery = '';
                    });
                  },
                  icon: const Icon(
                    Icons.clear,
                    color: AppColors.lightText,
                    size: 20,
                  ),
                )
              : null,
          filled: true,
          fillColor: AppColors.background,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: BorderSide.none,
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: BorderSide.none,
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: const BorderSide(color: AppColors.primary),
          ),
        ),
      ),
    );
  }

  Widget _buildRegionFilter() {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppTheme.spacingMD,
        vertical: AppTheme.spacingSM,
      ),
      color: AppColors.white,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: _regions.asMap().entries.map((entry) {
            final index = entry.key;
            final region = entry.value;
            final isSelected = index == _selectedRegionIndex;

            return Padding(
              padding: const EdgeInsets.only(right: 8),
              child: GestureDetector(
                onTap: () {
                  setState(() {
                    _selectedRegionIndex = index;
                  });
                },
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  decoration: BoxDecoration(
                    color:
                        isSelected ? AppColors.primary : AppColors.background,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color:
                          isSelected ? AppColors.primary : AppColors.dividers,
                    ),
                  ),
                  child: Text(
                    region,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: isSelected ? AppColors.white : AppColors.lightText,
                    ),
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  Widget _buildRinkList() {
    final rinks = _filteredRinks;

    if (rinks.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.location_off_outlined,
              size: 64,
              color: AppColors.lightText.withValues(alpha: 0.5),
            ),
            const SizedBox(height: AppTheme.spacingMD),
            const Text(
              '검색 결과가 없습니다.',
              style: TextStyle(
                fontSize: 16,
                color: AppColors.lightText,
              ),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(AppTheme.spacingMD),
      itemCount: rinks.length,
      itemBuilder: (context, index) {
        return _buildRinkCard(rinks[index]);
      },
    );
  }

  Widget _buildRinkCard(Rink rink) {
    return Container(
      margin: const EdgeInsets.only(bottom: AppTheme.spacingMD),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.dividers),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 상단 이미지/배너 영역
          Container(
            height: 140,
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.1),
              borderRadius:
                  const BorderRadius.vertical(top: Radius.circular(12)),
            ),
            child: Stack(
              children: [
                // 링크 아이콘
                const Center(
                  child: Icon(
                    Icons.sports_hockey,
                    size: 56,
                    color: AppColors.primary,
                  ),
                ),

                // 지역 배지
                Positioned(
                  top: 12,
                  left: 12,
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppColors.white,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.location_on,
                          size: 12,
                          color: AppColors.primary,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          rink.region,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: AppColors.primary,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

                // 즐겨찾기 버튼
                Positioned(
                  top: 12,
                  right: 12,
                  child: GestureDetector(
                    onTap: () {
                      setState(() {
                        // 즐겨찾기 토글 (실제로는 API 호출)
                      });
                    },
                    child: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: AppColors.white,
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.1),
                            blurRadius: 4,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: Icon(
                        rink.isFavorite
                            ? Icons.favorite
                            : Icons.favorite_border,
                        size: 20,
                        color: rink.isFavorite
                            ? AppColors.error
                            : AppColors.lightText,
                      ),
                    ),
                  ),
                ),

                // 별점
                Positioned(
                  bottom: 12,
                  left: 12,
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.6),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.star,
                          size: 14,
                          color: Color(0xFFFBBF24),
                        ),
                        const SizedBox(width: 4),
                        Text(
                          '${rink.rating}',
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: AppColors.white,
                          ),
                        ),
                        const SizedBox(width: 4),
                        Text(
                          '(${rink.reviewCount})',
                          style: TextStyle(
                            fontSize: 11,
                            color: AppColors.white.withValues(alpha: 0.8),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),

          // 링크 정보
          Padding(
            padding: const EdgeInsets.all(AppTheme.spacingMD),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 이름
                Text(
                  rink.name,
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                    color: AppColors.darkText,
                  ),
                ),
                const SizedBox(height: 8),

                // 주소
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(
                      Icons.location_on_outlined,
                      size: 16,
                      color: AppColors.lightText,
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        rink.address,
                        style: const TextStyle(
                          fontSize: 13,
                          color: AppColors.lightText,
                          height: 1.4,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),

                // 운영시간
                Row(
                  children: [
                    const Icon(
                      Icons.access_time,
                      size: 16,
                      color: AppColors.lightText,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      rink.operatingHours,
                      style: const TextStyle(
                        fontSize: 13,
                        color: AppColors.lightText,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),

                // 링크 규격
                Row(
                  children: [
                    const Icon(
                      Icons.straighten,
                      size: 16,
                      color: AppColors.lightText,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      rink.rinkSize,
                      style: const TextStyle(
                        fontSize: 13,
                        color: AppColors.lightText,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // 시설 태그
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: rink.facilities.take(4).map((facility) {
                    return Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppColors.background,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        facility,
                        style: const TextStyle(
                          fontSize: 11,
                          color: AppColors.lightText,
                        ),
                      ),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 12),

                // 하단 액션 영역
                Row(
                  children: [
                    // 이용요금
                    Expanded(
                      child: Text(
                        rink.priceInfo,
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: AppColors.primary,
                        ),
                      ),
                    ),

                    // 전화 버튼
                    GestureDetector(
                      onTap: () {
                        // 전화 걸기
                      },
                      child: Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: AppColors.success.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(
                          Icons.phone,
                          size: 20,
                          color: AppColors.success,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),

                    // 길찾기 버튼
                    GestureDetector(
                      onTap: () {
                        // 지도 앱 열기
                      },
                      child: Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: AppColors.primary.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(
                          Icons.directions,
                          size: 20,
                          color: AppColors.primary,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// 링크 모델
class Rink {
  final String id;
  final String name;
  final String region;
  final String address;
  final String phone;
  final String operatingHours;
  final String rinkSize;
  final List<String> facilities;
  final String? imageUrl;
  final double latitude;
  final double longitude;
  final String priceInfo;
  final bool isFavorite;
  final double rating;
  final int reviewCount;

  Rink({
    required this.id,
    required this.name,
    required this.region,
    required this.address,
    required this.phone,
    required this.operatingHours,
    required this.rinkSize,
    required this.facilities,
    this.imageUrl,
    required this.latitude,
    required this.longitude,
    required this.priceInfo,
    required this.isFavorite,
    required this.rating,
    required this.reviewCount,
  });
}

/// Design 7 Principles 적용 결과:
///
/// 1. 화면 분석 필수:
///    - backdata/KakaoTalk_20250107_154545877.jpg 참조
///    - Alpha Asia 경쟁앱의 구장 정보 구조 분석
///
/// 2. 휴먼 디자인:
///    - 깔끔한 카드 레이아웃
///    - 지역별 필터와 검색
///    - 시설 태그로 빠른 정보 확인
///
/// 3. AI 스타일 절대 금지:
///    - 그라데이션 미사용
///    - blur 효과 미사용
///    - 과도한 애니메이션 미사용
///
/// 4. 페르소나 융합:
///    - frontend: UI 구조, 카드 디자인
///    - architect: 데이터 모델, 필터 로직
///    - analyzer: 사용자 경험 분석
///
/// 5. 명령어 필수:
///    - frontend-design 활용
///    - --persona-frontend 적용
///
/// 6. 결과 출력 필수:
///    - 이 주석에서 적용 내용 명시
///
/// 7. Tone & Manner:
///    - 존댓말 사용 ("검색 결과가 없습니다.")
///    - 전문적 UI 텍스트 ("구장명 또는 주소로 검색")
