# Tokyo by default; resources that must live elsewhere (the CloudFront certificate) set their own `region`.
provider "aws" {
  region = "ap-northeast-1"

  default_tags {
    tags = {
      Project   = "lumineglyph"
      ManagedBy = "terraform"
      Stack     = "main"
    }
  }
}
