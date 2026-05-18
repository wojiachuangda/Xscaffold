// [test] ID: V1.1-1 | Date: 2026-05-19 | Description: SSRF 守卫单元测试
'use strict';

const { assertSafeUrl, isPrivateIp, _clearDnsCache } = require('../../src/toolRegistry/builtinTools/httpGuard');
const { ValidationError } = require('../../src/infrastructure/errors/AppError');

function publicLookup() {
    return Promise.resolve(['1.2.3.4']);
}

function privateLookup() {
    return Promise.resolve(['10.0.0.1']);
}

function mixedLookup() {
    return Promise.resolve(['1.2.3.4', '127.0.0.1']);
}

beforeEach(() => _clearDnsCache());

describe('协议与 URL 校验', () => {
    test('非法 URL → ValidationError', async () => {
        await expect(assertSafeUrl('not a url', { blockPrivateIPs: true })).rejects.toThrow(ValidationError);
    });

    test('file:// 拒绝', async () => {
        await expect(assertSafeUrl('file:///etc/passwd', { blockPrivateIPs: true })).rejects.toThrow(/协议/);
    });

    test('ftp:// 拒绝', async () => {
        await expect(assertSafeUrl('ftp://example.com/', { blockPrivateIPs: true })).rejects.toThrow(/协议/);
    });

    test('URL 含 userinfo 拒绝', async () => {
        await expect(
            assertSafeUrl('http://user:pass@example.com/', { blockPrivateIPs: true, dnsLookup: publicLookup }),
        ).rejects.toThrow(/userinfo/);
    });
});

describe('IP 字面量拒绝', () => {
    test('http://127.0.0.1 拒绝', async () => {
        await expect(assertSafeUrl('http://127.0.0.1/', { blockPrivateIPs: true })).rejects.toThrow(/IP 字面量/);
    });

    test('http://10.0.0.1 拒绝', async () => {
        await expect(assertSafeUrl('http://10.0.0.1/', { blockPrivateIPs: true })).rejects.toThrow(/IP 字面量/);
    });

    test('http://169.254.169.254（云元数据）拒绝', async () => {
        await expect(
            assertSafeUrl('http://169.254.169.254/latest/meta-data/', { blockPrivateIPs: true }),
        ).rejects.toThrow(/IP 字面量/);
    });

    test('IPv6 ::1 拒绝', async () => {
        await expect(assertSafeUrl('http://[::1]/', { blockPrivateIPs: true })).rejects.toThrow(/IP 字面量|私有\/内网/);
    });
});

describe('DNS 解析后校验（防 DNS 重绑定）', () => {
    test('公网 IP 解析通过', async () => {
        const r = await assertSafeUrl('http://example.com/', { blockPrivateIPs: true, dnsLookup: publicLookup });
        expect(r.ips).toEqual(['1.2.3.4']);
    });

    test('私有 IP 解析拒绝', async () => {
        await expect(
            assertSafeUrl('http://intranet.evil/', { blockPrivateIPs: true, dnsLookup: privateLookup }),
        ).rejects.toThrow(/私有\/内网/);
    });

    test('任一解析地址为私有即拒绝（防止多 A 记录混入内网）', async () => {
        await expect(
            assertSafeUrl('http://hybrid.evil/', { blockPrivateIPs: true, dnsLookup: mixedLookup }),
        ).rejects.toThrow(/私有\/内网/);
    });
});

describe('白名单覆盖', () => {
    test('hostname 白名单跳过 DNS 校验', async () => {
        const r = await assertSafeUrl('http://internal.svc/', {
            blockPrivateIPs: true,
            allowedHosts: ['internal.svc'],
        });
        expect(r.ips).toEqual(['allowlisted']);
    });

    test('环境变量 HTTP_REQUEST_ALLOWED_HOSTS 生效', async () => {
        const prev = process.env.HTTP_REQUEST_ALLOWED_HOSTS;
        process.env.HTTP_REQUEST_ALLOWED_HOSTS = 'safe.internal,other.local';
        const r = await assertSafeUrl('http://safe.internal/', { blockPrivateIPs: true });
        expect(r.ips).toEqual(['allowlisted']);
        process.env.HTTP_REQUEST_ALLOWED_HOSTS = prev || '';
    });
});

describe('disabled 模式（测试期）', () => {
    test('blockPrivateIPs=false 时全部放行', async () => {
        const r = await assertSafeUrl('http://127.0.0.1/', { blockPrivateIPs: false });
        expect(r.ips).toEqual(['guard-disabled']);
    });
});

describe('isPrivateIp 工具', () => {
    test.each([
        ['127.0.0.1', true],
        ['10.5.5.5', true],
        ['172.16.0.1', true],
        ['172.31.255.255', true],
        ['192.168.1.1', true],
        ['169.254.169.254', true],
        ['100.64.1.1', true],
        ['8.8.8.8', false],
        ['1.2.3.4', false],
        ['172.32.0.1', false],
        ['::1', true],
        ['fc00::1', true],
        ['fe80::1', true],
        ['2001:db8::1', false],
    ])('%s → %p', (ip, expected) => {
        expect(isPrivateIp(ip)).toBe(expected);
    });
});
