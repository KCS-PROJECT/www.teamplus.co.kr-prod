// Source: shared/types/enums.ts - UserType
enum UserRole {
  parent,
  coach,
  admin,
  child,
  teen,
  director,
  academyDirector,
  unknown,
}

UserRole userRoleFromType(String? userType) {
  switch (userType) {
    case 'parent':
      return UserRole.parent;
    case 'coach':
      return UserRole.coach;
    case 'director':
      return UserRole.director;
    case 'academy_director':
      return UserRole.academyDirector;
    case 'admin':
      return UserRole.admin;
    case 'child':
      return UserRole.child;
    case 'teen':
      return UserRole.teen;
    default:
      return UserRole.unknown;
  }
}

bool isRoleAllowed(UserRole role, Set<UserRole> allowedRoles) {
  if (allowedRoles.isEmpty) return true;
  if (role == UserRole.unknown) return true;
  return allowedRoles.contains(role);
}
