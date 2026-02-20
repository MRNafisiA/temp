# nProxy - A Multi-Mode Proxy Forwarding System

## Overview

nProxy is a Node.js-based proxy forwarding system that acts as an intermediary between incoming connections and outgoing destinations. Each connection is tracked with connection mapping at each hop, enabling traffic direction tracking and bidirectional flow management.

## Core Architecture

### Input Modes (Where traffic comes from)

#### 1. SOCKS Mode
- Starts a SOCKS5 proxy server using the `socksv5` package
- Listens on specified port
- Each new connection gets a unique local ID (incremental counter)
- Forwards traffic to configured output

#### 2. WebSocket (WS) Mode
- **Active Mode**: Initiates a single WebSocket connection to a remote WS server at specified address
- **Passive Mode**: Starts a WebSocket server listening on specified port, accepts exactly ONE connection then stops accepting
- Each connection requires 64-character secret authentication:
    - **Passive mode**: Validates incoming connection has correct secret
    - **Active mode**: Sends secret to authenticate with remote server

### Output Modes (Where traffic goes to)

#### 1. Internet Mode
- Direct forwarding to the public internet
- Standard proxy behavior

#### 2. WebSocket (WS) Mode
- **Active Mode**: Forwards traffic by establishing a single WebSocket connection to remote server with secret authentication
- **Passive Mode**: Waits for exactly one incoming WebSocket connection, validates secret, then forwards traffic through

## Traffic Flow & Connection Mapping

### Connection Identification
- Each server instance maintains its own connection counter
- **NO ID chaining** - IDs are NOT passed through the network
- Each hop maintains independent ID mapping tables:

### ID Mapping System

Each hop maintains two bidirectional mapping tables:

#### Incoming Mapping (Previous Hop ↔ Current Hop)
```
Previous Hop ID <--> Current Local ID
```
- Maps the ID received from previous hop to local connection ID
- Enables response routing back to correct sender

#### Outgoing Mapping (Current Hop ↔ Next Hop)
```
Current Local ID <--> Next Hop ID
```
- Maps local connection ID to the ID used when forwarding to next hop
- Enables response routing from next hop back to correct local connection

### Traffic Flow Example

```
Hop A                  Hop B                  Hop C
ID: A1                 ID: B1                 ID: C1
     -----[A1]----->    maps A1↔B1   -----[B1]----->    maps B1↔C1
     <-----[A1]-----    maps B1↔A1   <-----[B1]-----    maps C1↔B1
```

### Authentication
- All WebSocket connections require 64-character secret
- Secret is validated on incoming connections (passive mode)
- Secret is sent on outgoing connections (active mode)
- Ensures secure hop-to-hop communication

## Example Configurations

### SOCKS to Internet proxy
```json
{
  "input": { "mode": "socks", "port": 1080 },
  "output": { "mode": "internet" }
}
```

### Secure WebSocket Chain
```json
{
  "input": { 
    "mode": "ws", 
    "type": "passive", 
    "port": 8080,
    "secret": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2"
  },
  "output": { 
    "mode": "ws", 
    "type": "active", 
    "target": "ws://remote:9090",
    "secret": "f2e1d0c9b8a7z6y5x4w3v2u1t0s9r8q7p6o5n4m3l2k1j0i9h8g7f6e5d4c3b2a1"
  }
}
```

### Mixed mode with ID Mapping
```json
{
  "input": { "mode": "socks", "port": 1080 },
  "output": { 
    "mode": "ws", 
    "type": "active", 
    "target": "ws://proxy:8080",
    "secret": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2"
  }
}
```

The system is designed to be composable, allowing multiple nProxy instances to form chains, with each hop maintaining its own independent connection mapping tables for bidirectional traffic routing, secured by 64-character secrets between hops.