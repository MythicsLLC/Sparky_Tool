# Sparky Tool

Enterprise-grade PeopleSoft automation, Windows server orchestration, VPN-aware remote retrieval, and intelligent configuration management — built with React, FastAPI, and modern infrastructure tooling.

---

## Overview

Sparky Tool is a modern enterprise utility platform designed to simplify:

- PeopleSoft process triggering
- Windows server connectivity
- Remote file retrieval
- VPN-aware infrastructure access
- SFTP / SMB / WinRM / SSH operations
- Configuration profile management
- Automated validation and orchestration

The platform acts as a bridge between legacy enterprise ecosystems and modern automation workflows.

---

# Features

## PeopleSoft Integration

- Trigger PeopleSoft APIs
- Poll status endpoints automatically
- Support for:
  - Basic Authentication
  - Bearer Token Authentication
- Configurable process names
- Full API response viewer

---

## Multi-Protocol Retrieval Engine

Supports:

| Method | Description |
|---|---|
| SFTP | Secure Linux/Unix file transfer |
| SCP | SSH-based file retrieval |
| WinRM | PowerShell remote execution |
| SMB | Native Windows file shares |
| SSH | OpenSSH access to Windows |

---

## Windows Server Management

- WinRM connectivity testing
- SMB share validation
- SSH connectivity
- Remote file browsing
- Server path navigation
- Credential validation
- SSL support for WinRM

---

## VPN Support

Supports enterprise VPN workflows:

- Fortinet SSL VPN
- OpenConnect / AnyConnect
- OpenVPN
- WireGuard
- SSH Tunnels

Features include:

- Dynamic VPN profile configuration
- Secure credential handling
- Fingerprint validation
- SOCKS5 tunnel support

---

## Smart UI System

- Elegant enterprise-themed interface
- Dynamic section completion indicators
- Password masking & visibility toggles
- Real-time validation
- Rich error handling
- Animated status indicators
- Sticky save actions

---

# Technology Stack

## Frontend

- React
- Material UI (MUI)
- Context API
- Axios

## Backend

- FastAPI
- Python
- Pydantic
- WinRM libraries
- Paramiko

## Infrastructure

- Windows Server
- Linux
- SSH
- SMB
- VPN tunneling

---

# Project Structure

```bash
src/
├── api/
├── components/
│   ├── WinServerBrowser.jsx
│   └── ...
├── pages/
│   ├── Settings.jsx
│   └── ...
├── AuthContext.jsx
├── ThemeContext.jsx
└── ...