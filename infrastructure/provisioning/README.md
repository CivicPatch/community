# Provisioning

Terraform for the Cloudflare DNS record that points `community.civicpatch.org`
at GitHub Pages (`CivicPatch/community`).

## Record created

| Name                       | Type  | Target                 |
| -------------------------- | ----- | ---------------------- |
| `community.civicpatch.org` | CNAME | `civicpatch.github.io` |

DNS-only (not proxied) so GitHub Pages can provision the TLS certificate and
"Enforce HTTPS" works.

## Usage

```sh
cd infrastructure/provisioning

# Token: use the Cloudflare token, do not commit it.
export TF_VAR_cloudflare_api_token="$CLOUDFLARE_TOKEN_COMMUNITY"

# Zone ID for civicpatch.org: copy from the Cloudflare dashboard, or look it up:
export TF_VAR_zone_id="$(curl -s \
  -H "Authorization: Bearer $CLOUDFLARE_TOKEN_COMMUNITY" \
  'https://api.cloudflare.com/client/v4/zones?name=civicpatch.org' \
  | jq -r '.result[0].id')"

terraform init
terraform plan
terraform apply
```

## GitHub side (not managed here)

DNS alone is not enough — GitHub also needs to know the custom domain:

1. Add the custom domain in repo **Settings → Pages → Custom domain**
   (`community.civicpatch.org`), which writes a `CNAME` file. For this Vite
   build, ensure that `CNAME` ends up in `projects/home/dist` (e.g. add
   `projects/home/public/CNAME` containing `community.civicpatch.org`).
2. Wait for the DNS check to pass, then enable **Enforce HTTPS**.
