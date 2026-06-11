# JWT signing keys

**The PEM files here are DEV-ONLY** — committed so `docker compose up` works out
of the box, exactly like the other `*_dev_secret` values in docker-compose.yml.

- identity-service signs access tokens RS256 with the private key
  (`JWT_PRIVATE_KEY_B64`, identity only).
- Every other service and the web-portal middleware verify with the public key
  (`JWT_PUBLIC_KEY_B64`) and cannot mint user tokens.
- Service-to-service tokens use a separate `SERVICE_JWT_SECRET` (HS256) which
  cannot forge user tokens.

Production MUST generate its own pair and set the env vars (base64 of the PEM):

    openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out jwt-private.pem
    openssl pkey -in jwt-private.pem -pubout -out jwt-public.pem
    base64 -w0 jwt-private.pem   # → JWT_PRIVATE_KEY_B64 (identity-service only)
    base64 -w0 jwt-public.pem    # → JWT_PUBLIC_KEY_B64  (all services + web-portal)
