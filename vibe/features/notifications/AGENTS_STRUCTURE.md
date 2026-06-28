# Notification Feature - Agent Structure (Frontend)

> **Feature**: Notification System for Synco
> **Scope**: Frontend (synco_app)
> **Status**: Implementation Complete (Pending Validation)
> **Excluded**: Capacitor Mobile & Tauri Desktop (per user request)

---

## 🎯 Frontend Agent Overview

This document defines the frontend sub-agent structure for the Notification feature.

### Frontend Agent Types

| Type | Prefix | Responsibility | Scope |
|------|--------|-----------------|-------|
| Composables | `Agent-Composable-*` | Notification logic | src/composables |
| UI | `Agent-UI-*` | Visual components | src/components |
| Config | `Agent-Config-*` | Configuration files | src/config, public |
| Documentation | `Agent-Docs-*` | Guides, Status | vibe/features |

---

## 💻 Frontend Agents (synco_app)

### 1. Agent-Composable-Notification
- **Task ID**: frontend-nc-001
- **Responsibility**: Core notification state and methods
- **Files**:
  - `src/composables/useNotification.ts`
  - `src/types/types.ts` (NotificationType enum)
- **Dependencies**: WebSocket connection
- **Validation**:
  - State management (notifications, unreadCount)
  - Methods (addNotification, markAsRead, markAllAsRead, removeNotification)
  - WebSocket integration (joinNotificationRoom, leaveNotificationRoom)
  - Auto-registration on user login

### 2. Agent-Composable-FCM
- **Task ID**: frontend-fcm-002
- **Responsibility**: Firebase Cloud Messaging for Web
- **Files**:
  - `src/composables/useFCM.ts`
  - `src/config/firebase.ts`
  - `public/firebase-messaging-sw.js`
- **Dependencies**: Firebase SDK, Service Worker
- **Validation**:
  - Firebase initialization
  - Token registration and management
  - Background message handling
  - Foreground message handling
  - Token refresh

### 3. Agent-UI-NotificationCenter
- **Task ID**: frontend-ui-001
- **Responsibility**: Notification dropdown center
- **Files**:
  - `src/components/Notifications/NotificationCenter.vue`
- **Dependencies**: Agent-Composable-Notification
- **Validation**:
  - Dropdown toggle functionality
  - Notification list rendering
  - Empty state
  - Mark all as read button
  - Real-time updates

### 4. Agent-UI-NotificationItem
- **Task ID**: frontend-ui-002
- **Responsibility**: Individual notification item
- **Files**:
  - `src/components/Notifications/NotificationItem.vue`
- **Dependencies**: Agent-Composable-Notification
- **Validation**:
  - Notification rendering (title, body, timestamp)
  - Read/unread visual states
  - Click handling (navigation, actions)
  - Delete functionality
  - Icons and styling

### 5. Agent-Config-Firebase
- **Task ID**: frontend-config-001
- **Responsibility**: Firebase configuration
- **Files**:
  - `src/config/firebase.ts`
  - `.env` (VITE_FIREBASE_* variables)
- **Validation**:
  - Configuration object structure
  - Environment variable usage
  - Initialization timing

---

## 📚 Documentation Agents

### 1. Agent-Docs-FrontendGuide
- **Task ID**: docs-frontend-001
- **Responsibility**: Frontend developer guide
- **Files**:
  - `vibe/features/notifications/DEVELOPER_GUIDE_FRONTEND.md`
  - `vibe/features/notifications/notifications_composable.md`
  - `vibe/features/notifications/notifications_fcm_web.md`
  - `vibe/features/notifications/notifications_ui.md`
- **Validation**:
  - Usage examples for useNotification
  - Usage examples for useFCM
  - Component props documentation
  - Integration guides

### 2. Agent-Docs-ImplementationStatus
- **Task ID**: docs-status-001
- **Responsibility**: Frontend implementation status
- **Files**:
  - `vibe/features/notifications/IMPLEMENTATION_STATUS.md`
- **Validation**:
  - Accurate progress tracking
  - Up-to-date status for all frontend tasks

---

## 🚀 Agent Invocation Commands

### Individual Agents
```bash
# Validate notification composable
vibe task "Validate useNotification composable" --agent composable-notification

# Validate FCM composable
vibe task "Validate useFCM composable and Firebase config" --agent composable-fcm

# Validate NotificationCenter component
vibe task "Validate NotificationCenter component" --agent ui-notification-center

# Validate NotificationItem component
vibe task "Validate NotificationItem component" --agent ui-notification-item

# Validate Firebase configuration
vibe task "Validate Firebase configuration" --agent config-firebase
```

### Group Invocation
```bash
# Validate all composables
vibe task "Validate all notification composables" --agent composable

# Validate all UI components
vibe task "Validate all notification UI components" --agent ui

# Validate all frontend configuration
vibe task "Validate all frontend configuration" --agent config

# Validate all frontend documentation
vibe task "Validate all frontend documentation" --agent docs
```

### Complete Frontend Validation
```bash
# Validate entire frontend notification implementation
vibe task "Complete frontend notification validation" --agent frontend-all
```

---

## ✅ Agent Checklist (Frontend)

- [x] Agent-Composable-Notification
- [x] Agent-Composable-FCM
- [x] Agent-UI-NotificationCenter
- [x] Agent-UI-NotificationItem
- [x] Agent-Config-Firebase
- [x] Agent-Docs-FrontendGuide
- [x] Agent-Docs-ImplementationStatus
- [ ] Agent-Composable-Capacitor (EXCLUDED)
- [ ] Agent-UI-Capacitor (EXCLUDED)
- [ ] Agent-Composable-Tauri (EXCLUDED)
- [ ] Agent-UI-Tauri (EXCLUDED)

---

## 📊 Agent Status

| Agent | Status | Last Run | Result |
|-------|--------|----------|--------|
| Agent-Composable-Notification | pending | - | - |
| Agent-Composable-FCM | pending | - | - |
| Agent-UI-NotificationCenter | pending | - | - |
| Agent-UI-NotificationItem | pending | - | - |
| Agent-Config-Firebase | pending | - | - |
| Agent-Docs-FrontendGuide | pending | - | - |
| Agent-Docs-ImplementationStatus | pending | - | - |

---

## 🎛️ Complete Feature Launch Command

To launch all frontend agents (excluding Capacitor/Tauri) automatically:

```bash
# This launches all defined frontend agents in parallel
vibe task "LAUNCH ALL FRONTEND NOTIFICATION AGENTS" --agent frontend-all-exclude-mobile-desktop
```

---

*Generated by Mistral Vibe - Frontend Notification Feature Coordination*
