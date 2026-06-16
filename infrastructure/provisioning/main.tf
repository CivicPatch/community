# community.civicpatch.org -> <org>.github.io
# A subdomain on GitHub Pages only needs a CNAME (no apex A/AAAA records).
# https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site
resource "cloudflare_dns_record" "pages" {
  zone_id = var.zone_id
  name    = var.hostname
  type    = "CNAME"
  content = var.pages_cname_target
  ttl     = 1     # 1 = automatic
  proxied = false # DNS only, so GitHub Pages can issue/enforce HTTPS
}
