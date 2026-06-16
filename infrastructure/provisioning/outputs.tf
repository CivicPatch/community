output "pages_record" {
  description = "The CNAME record pointing the custom domain at GitHub Pages."
  value       = "${cloudflare_dns_record.pages.name} -> ${cloudflare_dns_record.pages.content}"
}
