'use strict';

const fs = require('fs');
const net = require('net');
const config = require('../config');

let blockedIps = new Set();

function normalizeIp(value) {
  if (typeof value !== 'string') return null;
  let ip = value.trim().toLowerCase();
  if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);
  const zoneIndex = ip.indexOf('%');
  if (zoneIndex !== -1) ip = ip.slice(0, zoneIndex);
  if (net.isIP(ip) === 0) return null;
  if (ip.startsWith('::ffff:')) {
    const mappedIpv4 = ip.slice('::ffff:'.length);
    if (net.isIP(mappedIpv4) === 4) return mappedIpv4;
  }
  return ip;
}

function reloadBlacklist() {
  try {
    const parsed = JSON.parse(fs.readFileSync(config.ipBlacklistFile, 'utf8'));
    if (!Array.isArray(parsed)) {
      throw new Error('Expected a JSON array of IP addresses');
    }

    const nextIps = new Set();
    for (const value of parsed) {
      const ip = normalizeIp(value);
      if (!ip) throw new Error(`Invalid IP address in blacklist: ${String(value)}`);
      nextIps.add(ip);
    }
    blockedIps = nextIps;
  } catch (err) {
    console.error(`Could not load IP blacklist (${config.ipBlacklistFile}): ${err.message}`);
  }
}

reloadBlacklist();
// Polling also detects atomic file replacements made by editors.
fs.watchFile(config.ipBlacklistFile, { interval: 1000, persistent: false }, reloadBlacklist);

function isBlocked(ip) {
  const normalized = normalizeIp(ip);
  return normalized !== null && blockedIps.has(normalized);
}

module.exports = { isBlocked };
