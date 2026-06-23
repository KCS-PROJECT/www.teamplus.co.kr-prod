// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'menu_models.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AppServerMenuItem _$AppServerMenuItemFromJson(Map<String, dynamic> json) =>
    AppServerMenuItem(
      id: json['id'] as String,
      userType: json['userType'] as String,
      label: json['label'] as String,
      icon: json['icon'] as String,
      href: json['href'] as String,
      parentId: json['parentId'] as String?,
      order: (json['order'] as num).toInt(),
      isActive: json['isActive'] as bool? ?? true,
      children: (json['children'] as List<dynamic>?)
              ?.map(
                  (e) => AppServerMenuItem.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
    );

Map<String, dynamic> _$AppServerMenuItemToJson(AppServerMenuItem instance) =>
    <String, dynamic>{
      'id': instance.id,
      'userType': instance.userType,
      'label': instance.label,
      'icon': instance.icon,
      'href': instance.href,
      'parentId': instance.parentId,
      'order': instance.order,
      'isActive': instance.isActive,
      'children': instance.children.map((e) => e.toJson()).toList(),
    };

MenuBadge _$MenuBadgeFromJson(Map<String, dynamic> json) => MenuBadge(
      type: json['type'] as String,
      provider: json['provider'] as String,
    );

Map<String, dynamic> _$MenuBadgeToJson(MenuBadge instance) => <String, dynamic>{
      'type': instance.type,
      'provider': instance.provider,
    };

MenuItem _$MenuItemFromJson(Map<String, dynamic> json) => MenuItem(
      id: json['id'] as String,
      label: json['label'] as String,
      icon: json['icon'] as String,
      route: json['route'] as String,
      order: (json['order'] as num).toInt(),
      roles: (json['roles'] as List<dynamic>).map((e) => e as String).toList(),
      badge: json['badge'] == null
          ? null
          : MenuBadge.fromJson(json['badge'] as Map<String, dynamic>),
      children: (json['children'] as List<dynamic>?)
              ?.map((e) => MenuItem.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
    );

Map<String, dynamic> _$MenuItemToJson(MenuItem instance) => <String, dynamic>{
      'id': instance.id,
      'label': instance.label,
      'icon': instance.icon,
      'route': instance.route,
      'order': instance.order,
      'roles': instance.roles,
      'badge': instance.badge,
      'children': instance.children,
    };

MenuConfig _$MenuConfigFromJson(Map<String, dynamic> json) => MenuConfig(
      version: json['version'] as String,
      updatedAt: DateTime.parse(json['updatedAt'] as String),
      menus: (json['menus'] as List<dynamic>)
          .map((e) => MenuItem.fromJson(e as Map<String, dynamic>))
          .toList(),
      bottomNav:
          (json['bottomNav'] as List<dynamic>).map((e) => e as String).toList(),
      drawer:
          (json['drawer'] as List<dynamic>).map((e) => e as String).toList(),
    );

Map<String, dynamic> _$MenuConfigToJson(MenuConfig instance) =>
    <String, dynamic>{
      'version': instance.version,
      'updatedAt': instance.updatedAt.toIso8601String(),
      'menus': instance.menus,
      'bottomNav': instance.bottomNav,
      'drawer': instance.drawer,
    };
