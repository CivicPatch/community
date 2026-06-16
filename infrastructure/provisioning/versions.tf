terraform {
  required_version = ">= 1.15"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.20"
    }
  }

  # Local state. Switch to a remote backend later if this is run from CI.
  backend "local" {}
}

provider "cloudflare" {
  # Reads the token from var.cloudflare_api_token.
  # Run with: TF_VAR_cloudflare_api_token="$CLOUDFLARE_TOKEN_COMMUNITY" terraform apply
  api_token = var.cloudflare_api_token
}
