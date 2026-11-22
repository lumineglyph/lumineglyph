# PR preview sites. https://pr-<N>.preview.lumineglyph.com/ serves the folder pr-<N>/ of a private bucket.
# A separate bucket and distribution from the live site, so the preview deploy role can't touch it (ADR-004).
resource "aws_s3_bucket" "previews" {
  bucket = "lumineglyph-previews-8d346f"
}

# No versioning: previews are throwaway. Files older than 30 days are deleted, in case the cleanup
# workflow ever misses a closed PR. Every preview deploy uploads all its files again, so an open PR
# keeps its preview as long as it gets a push at least every 30 days.
resource "aws_s3_bucket_lifecycle_configuration" "previews" {
  bucket = aws_s3_bucket.previews.id

  rule {
    id     = "expire-previews"
    status = "Enabled"
    filter {}

    expiration {
      days = 30
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "previews" {
  bucket = aws_s3_bucket.previews.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "previews" {
  bucket                  = aws_s3_bucket.previews.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "previews" {
  bucket = aws_s3_bucket.previews.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

output "previews_bucket" {
  value = aws_s3_bucket.previews.bucket
}
