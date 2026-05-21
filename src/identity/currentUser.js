// [scaffold] ID: V2.5-MT | Date: 2026-05-21 | Description: 当前用户解析——统一从 req.user 取归属 id（API key 的 id / JWT 的 sub / dev 默认），供 agent owner scope 用
'use strict';

// dev / AUTH_DISABLED 下的默认归属用户（与迁移 008 注入的行一致）
const DEFAULT_USER_ID = 'user_dev_default';

/**
 * 解析当前请求归属的用户 id：
 * - API key 中间件注入 req.user.id
 * - JWT 注入 req.user.sub
 * - 都没有（dev/AUTH_DISABLED）→ 默认用户
 */
function ownerIdOf(req) {
    return (req && req.user && (req.user.id || req.user.sub)) || DEFAULT_USER_ID;
}

module.exports = { DEFAULT_USER_ID, ownerIdOf };
