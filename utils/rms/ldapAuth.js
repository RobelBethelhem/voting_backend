import ldap from "ldapjs";

const TIMEOUT_MS = 10000;

// Checks a domain username and password with a simple bind as DOMAIN\username against
// Active Directory (LDAP_URL, LDAP_DOMAIN in .env).
// Resolves true when AD accepts them, false when it rejects them, and rejects only when
// AD can't be reached.
export function verifyDomainCredentials(username, password) {
    // AD treats a bind with an empty password as an anonymous bind and accepts it
    if (!username || typeof password !== "string" || password.length === 0) {
        return Promise.resolve(false);
    }

    const url = process.env.LDAP_URL || "ldap://mbdcp06.zemenbank.local:389";
    const domain = process.env.LDAP_DOMAIN || "Zemenbank";

    return new Promise((resolve, reject) => {
        const client = ldap.createClient({ url, connectTimeout: TIMEOUT_MS, timeout: TIMEOUT_MS });
        let settled = false;

        const finish = (settle, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            try {
                client.destroy();
            } catch {
                // already closed
            }
            settle(value);
        };

        // Without these listeners a refused or timed-out connection would crash the process
        const unreachable = (err) =>
            finish(reject, new Error(`Active Directory unreachable: ${err?.message || err}`));
        client.on("error", unreachable);
        client.on("connectError", unreachable);
        client.on("connectRefused", unreachable);
        client.on("connectTimeout", unreachable);
        client.on("timeout", unreachable);
        const timer = setTimeout(() => unreachable(new Error("timed out")), TIMEOUT_MS + 2000);

        client.bind(`${domain}\\${username}`, password, (err) => {
            if (!err) return finish(resolve, true);
            // An LDAP result code (49 invalid credentials, also used for locked or disabled
            // accounts) means AD answered and said no; socket errors carry string codes
            if (err instanceof ldap.InvalidCredentialsError || typeof err.code === "number") {
                return finish(resolve, false);
            }
            unreachable(err);
        });
    });
}
