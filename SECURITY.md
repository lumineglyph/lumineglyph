# Security policy / セキュリティポリシー

- [English](#english)
- [日本語](#日本語)

---

## English

### Reporting a vulnerability

Please report security problems **privately**, through this repository's **Security** tab → **Report a vulnerability** (https://github.com/lumineglyph/lumineglyph/security/advisories/new). Only the maintainers can see the report.

Please don't open a public issue, pull request or discussion about it.

A useful report says:
- what the problem is, and where (a URL, or a file in this repository)
- how to reproduce it
- what an attacker could do with it

### Scope

- the website at https://lumineglyph.com/ and its subdomains, including the pull request previews (`*.preview.lumineglyph.com`)
- the site's source code (`site/`)
- the infrastructure code (`infra/`)
- the GitHub Actions workflows (`.github/workflows/`)

Not in scope:
- problems in GitHub, AWS or the email forwarding service themselves. Please report those to the provider.
- denial of service, and anything that needs a large number of requests
- social engineering, phishing or physical access
- automated scanner output with no demonstrated impact

When testing, please keep requests to what's needed to show the problem. The site is static, with no accounts or user data, and heavy traffic costs us money.

### What to expect

Lumineglyph is a two-person studio, so please be patient:
- We'll reply within **7 days** to say we've received the report.
- We'll tell you whether we accept it and, if so, when we expect to fix it.
- Once it's fixed, we can credit you in the published advisory if you'd like.

There is no bug bounty.

Only the current site and the `main` branch are supported. There are no older versions to patch.

---

## 日本語

### 脆弱性の報告

セキュリティ上の問題は、このリポジトリの **Security** タブ → **Report a vulnerability**（https://github.com/lumineglyph/lumineglyph/security/advisories/new）から**非公開で**ご報告ください。報告内容は管理者だけが閲覧できます。

公開の Issue、プルリクエスト、Discussion には書かないでください。

報告には次の内容があると助かります。
- 問題の内容と場所（URL、またはこのリポジトリ内のファイル）
- 再現手順
- 攻撃者がそれを使って何をできるか

### 対象範囲

- ウェブサイト https://lumineglyph.com/ とそのサブドメイン（プルリクエストのプレビュー `*.preview.lumineglyph.com` を含む）
- サイトのソースコード（`site/`）
- インフラのコード（`infra/`）
- GitHub Actions のワークフロー（`.github/workflows/`）

対象外:
- GitHub、AWS、メール転送サービス自体の問題（各サービスに直接ご報告ください）
- サービス妨害（DoS）や、大量のリクエストを必要とするもの
- ソーシャルエンジニアリング、フィッシング、物理的なアクセス
- 実際の影響が示されていない、自動スキャナーの結果のみの報告

テストの際は、問題を示すのに必要な範囲のリクエストにとどめてください。サイトは静的で、アカウントや利用者のデータはありません。大量のアクセスは費用の負担になります。

### 対応について

Lumineglyph は2人のスタジオのため、少しお時間をいただくことがあります。
- 報告を受け取ってから **7日以内** に、受領のご連絡をします。
- 問題として受け付けるかどうかと、受け付ける場合の修正の見込み時期をお知らせします。
- 修正後、ご希望があれば公開するアドバイザリーにお名前を記載します。

バグバウンティ（報奨金）はありません。

サポート対象は現在のサイトと `main` ブランチのみです。修正が必要な旧バージョンはありません。
