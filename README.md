# 🚀 SilverTeams (Synco) - Frontend Application

**French Sovereign Collaboration Platform** - Secure alternative to Slack/Teams

## 📋 Project Overview

SilverTeams (Synco) is a secure, sovereign collaboration platform built with modern web technologies. This repository contains the frontend application built with Vue 3, TypeScript, and Vite.

## 🏗️ Technical Stack

- **Framework**: Vue 3 + Composition API
- **Language**: TypeScript 5.9+
- **Bundler**: Vite 7
- **State Management**: Pinia
- **Styling**: Tailwind CSS 4
- **Authentication**: Keycloak
- **Real-time**: Socket.io
- **E2EE**: Web Crypto API
- **Calls**: LiveKit + PeerJS

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- Bun runtime (recommended)
- Keycloak instance
- Backend API running

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### Configuration

Copy `.env.example` to `.env` and configure:

```env
VITE_API_URL=http://localhost:3000
VITE_SOCKET_URL=http://localhost:3000
VITE_KEYCLOAK_URL=http://localhost:8080
VITE_KEYCLOAK_REALM=synco
VITE_KEYCLOAK_CLIENT_ID=synco-app
```

## 📁 Project Structure

```
src/
├── assets/           # Utilities, configs, and crypto
├── composables/      # Vue composables (useWSocket, useSecurePeer, etc.)
├── components/       # Reusable UI components
├── types/            # TypeScript types and interfaces
├── views/            # Main application views
└── App.vue           # Root component
```

## 🔐 Security Features

- **End-to-End Encryption**: RSA-OAEP + AES-GCM-256
- **Secure Authentication**: Keycloak SSO
- **Perfect Forward Secrecy**: Unique session keys
- **Anti-replay Protection**: 30-second window
- **Session Hijacking Prevention**: Call ID validation

## 📖 Documentation

- [SYNCO_CHAT_SESSION_GUIDE.md](SYNCO_CHAT_SESSION_GUIDE.md) - Development guide
- [E2EE_IMPROVEMENTS.md](E2EE_IMPROVEMENTS.md) - E2EE roadmap

## 🛠️ Available Scripts

```bash
# Development
npm run dev           # Start dev server with hot reload

# Build
npm run build         # Production build
npm run preview       # Preview production build

# Type Checking
npm run type-check    # TypeScript validation
```

## 🎯 Development Guidelines

- **TypeScript Strict**: Zero `any` types allowed
- **E2EE First**: All messages must support encryption
- **Security First**: Validate all inputs, handle all errors
- **Clean Code**: Follow ESLint/Prettier rules
- **Atomic Commits**: Small, focused changes with clear messages

## 🤝 Contributing

Please refer to the [Development Guide](SYNCO_CHAT_SESSION_GUIDE.md) for detailed contribution guidelines.

## 📞 Support

For security issues or urgent problems, contact the SilverCore Team immediately.

---

> 💡 **Security is our top priority** - Always follow the strict development rules outlined in the documentation.
