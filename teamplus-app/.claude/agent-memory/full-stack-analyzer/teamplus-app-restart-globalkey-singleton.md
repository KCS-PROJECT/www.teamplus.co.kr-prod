---
name: teamplus-app-restart-globalkey-singleton
description: Flutter soft-restart (ProviderScope subtree regen) collides with global navigatorKey reuse and permanently-dead process singletons — verify before recommending RestartWidget-style restarts
metadata:
  type: project
---

teamplus-app uses a process-wide `navigatorKey` (GlobalKey) injected into a `GoRouter` built by a regular Riverpod `Provider` (`goRouterProvider` in `lib/core/router/app_router.dart`). A code comment there (around line 80-94) documents a real prior crash: when `goRouterProvider` rebuilds, a NEW GoRouter + NEW Navigator is created sharing the SAME global navigatorKey → `Duplicate GlobalKey` + `_lifecycleState == inactive` red-screen assertion + `AndroidPullToRefreshController was used after being disposed`. The fix was to make GoRouter build exactly once and drive auth via refreshListenable.

**Why this matters:** Any "soft restart" that regenerates the ProviderScope subtree with a new UniqueKey (e.g. `RestartWidget` in `lib/core/restart/restart_widget.dart`) re-runs `goRouterProvider` → re-triggers the exact crash the comment warns about. The restart pattern fights an explicitly-engineered single-instance constraint.

**Second hazard — dead singletons:** `WebSocketService` (`lib/core/websocket/websocket_service.dart`) is a true process singleton (`static final _instance`). `TeamplusApp.dispose()` calls `WebSocketService().dispose()` which sets `_isDisposed=true` PERMANENTLY (never reset to false anywhere) and closes its broadcast StreamControllers. A widget-tree restart disposes TeamplusApp → kills the singleton for the rest of the process. After such a restart, `connect()` early-returns on `_isDisposed`, so WebSocket is dead until a true cold start.

**How to apply:** Before endorsing or shipping any in-process restart/root-regeneration in teamplus-app, verify (1) navigatorKey is not reused across the regenerated Navigator, and (2) no process singletons disposed in `TeamplusApp.dispose()` have a permanent dead-flag with no re-init path. Related: [[teamplus-prod-domains]] context for app entrypoints.

**Safe alternative that was adopted (2026-06-18):** Instead of regenerating ProviderScope, re-gate via the SINGLE existing GoRouter: `ref.read(goRouterProvider).go('/webview', extra:{'gateKey': UniqueKey()})`, and `/webview` builder passes `InitialDestinationGate(key: extras?['gateKey'] as Key?)`. This avoids both hazards (no new GoRouter/Navigator → no Duplicate GlobalKey; no ProviderScope reset → WebSocket singleton survives). Mechanism note: go_router's auto page key is a path-derived `ValueKey<String>` that ignores `extra`, so the `MaterialPage` for `/webview` is REUSED on a same-location `go()`; State recreation is forced solely by the changing child widget key (UniqueKey) via Flutter element reconciliation. `/webview` is an explicit public route in the redirect guard, so re-gating never mis-redirects. The home/dashboard WebView is itself mounted at `/webview` (initialLocation), so mid-use maintenance is almost always a same-location re-gate.
