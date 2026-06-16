variable "cloudflare_api_token" {
  description = "Cloudflare API token. Pass CLOUDFLARE_TOKEN_COMMUNITY via TF_VAR_cloudflare_api_token."
  type        = string
  sensitive   = true
}

variable "zone_id" {
  description = "Cloudflare zone ID for civicpatch.org. Find it on the zone's Overview page, or: curl -s -H \"Authorization: Bearer $CLOUDFLARE_TOKEN_COMMUNITY\" 'https://api.cloudflare.com/client/v4/zones?name=civicpatch.org' | jq -r '.result[0].id'"
  type        = string
}

variable "hostname" {
  description = "Custom subdomain served by GitHub Pages."
  type        = string
  default     = "community.civicpatch.org"
}

variable "pages_cname_target" {
  description = "GitHub Pages host the CNAME points at (<org>.github.io)."
  type        = string
  default     = "civicpatch.github.io"
}
