import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/providers/shared_providers.dart';
import '../../../../core/theme/colors.dart';
import '../../../../shared/widgets/app_button.dart';
import '../../../../shared/widgets/app_input.dart';
import '../../../../shared/widgets/teamplus_app_bar.dart';
import '../../data/clubs_api.dart';
import 'club_qr_scanner_screen.dart';

class ClubJoinScreen extends ConsumerStatefulWidget {
  const ClubJoinScreen({super.key});

  @override
  ConsumerState<ClubJoinScreen> createState() => _ClubJoinScreenState();
}

class _ClubJoinScreenState extends ConsumerState<ClubJoinScreen> {
  late TextEditingController _codeController;
  late TextEditingController _playerNameController;
  late TextEditingController _playerAgeController;

  bool _isLoading = false;
  String? _errorMessage;
  TeamInfoDto? _clubInfo;

  @override
  void initState() {
    super.initState();
    _codeController = TextEditingController();
    _playerNameController = TextEditingController();
    _playerAgeController = TextEditingController();
  }

  @override
  void dispose() {
    _codeController.dispose();
    _playerNameController.dispose();
    _playerAgeController.dispose();
    super.dispose();
  }

  void _handleVerifyCode() async {
    final code = _codeController.text.trim();

    if (code.isEmpty) {
      setState(() {
        _errorMessage = '초대코드를 입력해주세요.';
      });
      return;
    }

    if (code.length < 3) {
      setState(() {
        _errorMessage = '올바른 초대코드를 입력해주세요.';
      });
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final clubsApi = ref.read(clubsApiProvider);
      final clubInfo = await clubsApi.verifyClubCode(code);

      setState(() {
        _clubInfo = clubInfo;
        _isLoading = false;
      });
    } on ClubNotFoundException catch (e) {
      setState(() {
        _isLoading = false;
        _errorMessage = e.message;
      });
    } on ClubApiException catch (e) {
      setState(() {
        _isLoading = false;
        _errorMessage = e.message;
      });
    } catch (e) {
      setState(() {
        _isLoading = false;
        _errorMessage = '초대코드를 확인할 수 없습니다. 다시 시도해주세요.';
      });
    }
  }

  void _handleJoinClub() async {
    // 선수 정보 유효성 검사
    final playerName = _playerNameController.text.trim();
    final playerAgeText = _playerAgeController.text.trim();

    if (playerName.isEmpty) {
      setState(() {
        _errorMessage = '선수 이름을 입력해주세요.';
      });
      return;
    }

    if (playerName.length < 2) {
      setState(() {
        _errorMessage = '선수 이름은 최소 2글자 이상이어야 합니다.';
      });
      return;
    }

    if (playerAgeText.isEmpty) {
      setState(() {
        _errorMessage = '선수 나이를 입력해주세요.';
      });
      return;
    }

    final playerAge = int.tryParse(playerAgeText);
    if (playerAge == null || playerAge < 0 || playerAge > 120) {
      setState(() {
        _errorMessage = '올바른 나이를 입력해주세요. (0~120)';
      });
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final clubsApi = ref.read(clubsApiProvider);
      final request = JoinClubRequest(
        clubCode: _clubInfo!.teamCode,
        playerName: playerName,
        playerAge: playerAge,
      );

      await clubsApi.joinClub(request);

      // 가입 신청 성공 후 Provider 무효화
      ref.invalidate(myClubsProvider);
      ref.invalidate(currentClubProvider);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('팀 참가 신청이 완료되었습니다. 코치 승인을 기다려주세요.'),
            backgroundColor: AppColors.success,
          ),
        );
        Navigator.pop(context, true); // 성공 결과 전달
      }
    } on ClubAlreadyJoinedException catch (e) {
      setState(() {
        _isLoading = false;
        _errorMessage = e.message;
      });
    } on ClubNotFoundException catch (e) {
      setState(() {
        _isLoading = false;
        _errorMessage = e.message;
      });
    } on ClubApiException catch (e) {
      setState(() {
        _isLoading = false;
        _errorMessage = e.message;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = '클럽 참가 신청 중 오류가 발생했습니다.';
        });
      }
    }
  }

  void _handleScanQR() async {
    final code = await Navigator.push<String>(
      context,
      MaterialPageRoute(
        builder: (context) => const ClubQrScannerScreen(),
      ),
    );

    if (code != null && code.isNotEmpty && mounted) {
      _codeController.text = code;
      _handleVerifyCode();
    }
  }

  void _handleResetCode() {
    setState(() {
      _clubInfo = null;
      _errorMessage = null;
      _playerNameController.clear();
      _playerAgeController.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const TeamplusAppBar(title: '팀 참가하기'),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Icon
              Center(
                child: Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const Icon(
                    Icons.sports_hockey,
                    size: 48,
                    color: AppColors.primary,
                  ),
                ),
              ),
              const SizedBox(height: 24),

              // Title
              Text(
                _clubInfo == null ? '팀 초대코드를' : '선수 정보를',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                  color: AppColors.darkText,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                _clubInfo == null ? '입력해주세요.' : '입력해주세요.',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                  color: AppColors.darkText,
                ),
              ),
              const SizedBox(height: 32),

              // Code Input
              AppTextField(
                controller: _codeController,
                hintText: '예: ACE-hockey',
                prefixIcon: Icons.key,
                enabled: !_isLoading && _clubInfo == null,
                onChanged: (value) {
                  if (_errorMessage != null) {
                    setState(() {
                      _errorMessage = null;
                    });
                  }
                },
                suffixIcon: _clubInfo == null
                    ? null
                    : const Icon(Icons.check_circle, color: AppColors.success),
              ),
              const SizedBox(height: 16),

              // Error Message
              if (_errorMessage != null)
                ErrorMessageBox(message: _errorMessage!),

              // Club Info Display
              if (_clubInfo != null) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: AppColors.success.withValues(alpha: 0.1),
                    border: Border.all(color: AppColors.success),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Row(
                            children: [
                              Icon(
                                Icons.check_circle,
                                color: AppColors.success,
                                size: 24,
                              ),
                              SizedBox(width: 12),
                              Text(
                                '팀 정보 확인됨',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                  color: AppColors.success,
                                ),
                              ),
                            ],
                          ),
                          // 다른 클럽 찾기 버튼
                          TextButton(
                            onPressed: _isLoading ? null : _handleResetCode,
                            child: const Text(
                              '변경',
                              style: TextStyle(
                                fontSize: 14,
                                color: AppColors.primary,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const Divider(height: 24),
                      _buildClubInfoRow('팀명', _clubInfo!.name),
                      const SizedBox(height: 8),
                      _buildClubInfoRow('담당코치', _clubInfo!.coachName ?? '-'),
                      const SizedBox(height: 8),
                      _buildClubInfoRow('회원 수', '${_clubInfo!.memberCount}명'),
                      if (_clubInfo!.location != null) ...[
                        const SizedBox(height: 8),
                        _buildClubInfoRow('위치', _clubInfo!.location!),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 24),

                // Player Information Input
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: AppColors.background,
                    border: Border.all(color: AppColors.borderColor),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Row(
                        children: [
                          Icon(
                            Icons.person_add,
                            color: AppColors.primary,
                            size: 20,
                          ),
                          SizedBox(width: 8),
                          Text(
                            '선수 정보 입력',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                              color: AppColors.darkText,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      AppTextField(
                        controller: _playerNameController,
                        labelText: '선수 이름',
                        hintText: '예: 홍길동',
                        prefixIcon: Icons.badge,
                        enabled: !_isLoading,
                        onChanged: (value) {
                          if (_errorMessage != null) {
                            setState(() {
                              _errorMessage = null;
                            });
                          }
                        },
                      ),
                      const SizedBox(height: 16),
                      AppTextField(
                        controller: _playerAgeController,
                        labelText: '선수 나이',
                        hintText: '예: 10',
                        prefixIcon: Icons.cake,
                        keyboardType: TextInputType.number,
                        enabled: !_isLoading,
                        onChanged: (value) {
                          if (_errorMessage != null) {
                            setState(() {
                              _errorMessage = null;
                            });
                          }
                        },
                      ),
                    ],
                  ),
                ),
              ],

              const SizedBox(height: 24),

              // Verify/Join Button
              if (_clubInfo == null)
                PrimaryButton(
                  label: '코드 확인하기',
                  onPressed: _handleVerifyCode,
                  isLoading: _isLoading,
                  icon: Icons.search,
                )
              else
                PrimaryButton(
                  label: '참가 신청하기',
                  onPressed: _handleJoinClub,
                  isLoading: _isLoading,
                  icon: Icons.check,
                ),

              const SizedBox(height: 16),

              // Divider
              const Row(
                children: [
                  Expanded(child: Divider()),
                  Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16),
                    child: Text(
                      '또는',
                      style: TextStyle(
                        fontSize: 14,
                        color: AppColors.lightText,
                      ),
                    ),
                  ),
                  Expanded(child: Divider()),
                ],
              ),
              const SizedBox(height: 16),

              // QR Code Scan Button
              SecondaryButton(
                label: 'QR코드 스캔하기',
                onPressed: _isLoading ? null : _handleScanQR,
                icon: Icons.qr_code_scanner,
              ),
              const SizedBox(height: 32),

              // Info Box
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.info.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Row(
                      children: [
                        Icon(
                          Icons.info_outline,
                          color: AppColors.info,
                          size: 20,
                        ),
                        SizedBox(width: 8),
                        Text(
                          '팀 참가 방법',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.bold,
                            color: AppColors.info,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    _buildInfoItem('코드 입력하면 팀 정보가 자동으로 확인됩니다'),
                    const SizedBox(height: 4),
                    _buildInfoItem('선수 정보를 입력하고 참가 신청을 합니다'),
                    const SizedBox(height: 4),
                    _buildInfoItem('코치 승인 후 수업 등록이 가능합니다'),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildClubInfoRow(String label, String value) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 80,
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 14,
              color: AppColors.lightText,
            ),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: AppColors.darkText,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildInfoItem(String text) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('• ', style: TextStyle(color: AppColors.info)),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(
              fontSize: 12,
              color: AppColors.info,
            ),
          ),
        ),
      ],
    );
  }
}
