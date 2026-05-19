// [scaffold] ID: V1.1-1 | Date: 2026-05-19 | Description: SSRF 防护——URL 协议白名单 + 私有 IP 拒绝 + DNS 重绑定校验
'use strict';

const dns = require('dns/promises');
const net = require('net');

const { ValidationError } = require('../../infrastructure/errors/AppError');

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const DNS_CACHE_TTL_MS = 5 * 60 * 1000;
const PRIVATE_IPV4_CIDRS = [
    { net: '0.0.0.0', mask: 8 },
    { net: '10.0.0.0', mask: 8 },
    { net: '127.0.0.0', mask: 8 },
    { net: '169.254.0.0', mask: 16 },
    { net: '172.16.0.0', mask: 12 },
    { net: '192.168.0.0', mask: 16 },
    { net: '100.64.0.0', mask: 10 },
];

const dnsCache = new Map();

/**
 * 核心入口：检查 URL 是否允许 HTTP 调用
 * @param {string} rawUrl
 * @param {object} [options]
 * @param {string[]} [options.allowedHosts]  白名单 hostname（精确匹配；命中则跳过私有 IP 检查）
 * @param {boolean} [options.blockPrivateIPs] 默认 true
 * @param {Function} [options.dnsLookup] 注入测试 DNS
 */
async function assertSafeUrl(rawUrl, options = {}) {
    const url = parseUrlOrThrow(rawUrl);
    assertProtocol(url);
    assertNoUserinfo(url);
    const opts = resolveOptions(options);
    if (opts.allowedHosts.has(url.hostname)) {
        return { url, host: url.hostname, ips: ['allowlisted'] };
    }
    if (!opts.blockPrivateIPs) {
        return { url, host: url.hostname, ips: ['guard-disabled'] };
    }
    assertNotIpLiteral(url);
    const ips = await resolveIps(url.hostname, opts.dnsLookup);
    assertAllPublic(ips, url.hostname);
    return { url, host: url.hostname, ips };
}

function parseUrlOrThrow(rawUrl) {
    try {
        return new URL(rawUrl);
    } catch {
        throw new ValidationError(`非法 URL: ${rawUrl}`);
    }
}

function assertProtocol(url) {
    if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
        throw new ValidationError(`仅允许 http/https 协议，收到: ${url.protocol}`);
    }
}

function assertNoUserinfo(url) {
    if (url.username || url.password) {
        throw new ValidationError('URL 不允许携带 userinfo');
    }
}

function assertNotIpLiteral(url) {
    // Node 20 的 URL.hostname 对 IPv6 字面量保留方括号（如 '[::1]'）；Node 22+ 已修正去括号。
    // 这里统一剥离方括号后再用 net.isIP 判定，跨 Node 版本一致。
    const host = url.hostname.replace(/^\[(.*)\]$/, '$1');
    if (net.isIP(host) !== 0) {
        throw new ValidationError(`禁止直接以 IP 字面量为目标: ${url.hostname}`);
    }
}

function resolveOptions(options) {
    const envHosts = (process.env.HTTP_REQUEST_ALLOWED_HOSTS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const allowedHosts = new Set([...(options.allowedHosts || []), ...envHosts]);
    const blockPrivateIPs = options.blockPrivateIPs ?? process.env.HTTP_REQUEST_BLOCK_PRIVATE_IPS !== 'false';
    return { allowedHosts, blockPrivateIPs, dnsLookup: options.dnsLookup };
}

async function resolveIps(hostname, customLookup) {
    const cached = dnsCache.get(hostname);
    if (cached && Date.now() - cached.at < DNS_CACHE_TTL_MS) {
        return cached.ips;
    }
    const ips = await doLookup(hostname, customLookup);
    dnsCache.set(hostname, { ips, at: Date.now() });
    return ips;
}

async function doLookup(hostname, customLookup) {
    if (customLookup) {
        return customLookup(hostname);
    }
    const results = await dns.lookup(hostname, { all: true, verbatim: true });
    return results.map((r) => r.address);
}

function assertAllPublic(ips, hostname) {
    for (const ip of ips) {
        if (isPrivateIp(ip)) {
            throw new ValidationError(`目标 IP 为私有/内网地址: ${hostname} → ${ip}`);
        }
    }
}

function isPrivateIp(ip) {
    if (net.isIPv6(ip)) {
        return isPrivateIPv6(ip);
    }
    if (!net.isIPv4(ip)) {
        return true;
    }
    return PRIVATE_IPV4_CIDRS.some((cidr) => ipInCidr(ip, cidr));
}

function isPrivateIPv6(ip) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') {
        return true;
    }
    return lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80');
}

function ipInCidr(ip, cidr) {
    const ipNum = ipv4ToInt(ip);
    const netNum = ipv4ToInt(cidr.net);
    const mask = cidr.mask === 0 ? 0 : ~0 << (32 - cidr.mask);
    return (ipNum & mask) === (netNum & mask);
}

function ipv4ToInt(ip) {
    return ip.split('.').reduce((acc, oct) => ((acc << 8) >>> 0) + Number(oct), 0) >>> 0;
}

function _clearDnsCache() {
    dnsCache.clear();
}

module.exports = { assertSafeUrl, isPrivateIp, _clearDnsCache };
