import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/api_client.dart';
import '../../data/class_dto.dart';

/// GET /api/v1/classes 전체 수업 목록
final classesListProvider = FutureProvider<List<ClassDto>>((ref) async {
  final response = await ApiClient().get('/api/v1/classes');
  final data = response.data['data'] as List<dynamic>;
  return data
      .map((e) => ClassDto.fromJson(e as Map<String, dynamic>))
      .where((c) => c.isActive)
      .toList();
});
