# Editing the Lumineglyph site / サイトの編集方法

- [日本語](#日本語)
- [English](#english)

---

## 日本語

文章の修正や制作実績の追加は、すべて github.com 上（ブラウザ）で行えます。ソフトのインストールは不要です。

**流れ:** ファイルを編集 → 新しいブランチとプルリクエスト（PR）を作成 → プレビューで確認 → マージ（公開）

`main` に直接保存することはできません。変更は必ずプルリクエストを通ります。公開前にプレビューで確認でき、確認するまでは本番サイトに反映されないので、安心して編集してください。

> GitHub の画面は英語です。ここではボタン名を英語のまま「"Commit changes…"」のように書いています。表記が少し違う場合もあります。

### 1. 文章を変える

サイトの文章は2つのファイルにあります。

| ファイル | 内容 |
|---|---|
| `site/src/i18n/ja.json` | 日本語ページの文章 |
| `site/src/i18n/en.json` | 英語ページの文章 |

1. github.com でリポジトリを開き、`site` → `src` → `i18n` → `ja.json`（または `en.json`）の順にクリックします。
2. 右上の鉛筆アイコン（"Edit this file"）をクリックします。
3. 変えたい文章を探します（`Ctrl+F`、Mac は `Cmd+F`）。
4. 文章を書き換えます。各行は `"キー": "文章"` の形になっています。

   ```json
   "contact": "相談する",
   ```

   - **変えてよいのは右側の `"…"` の中だけです。** 左側（キー）は変えないでください。
   - `"` と `,` は消さないでください。
   - `\n` は改行です。
   - 文章の中で `"` を使いたいときは、代わりに「」や “ ” を使ってください。
   - 日本語と英語の両方を変えるときは、`ja.json` と `en.json` をそれぞれ編集します。2つのファイルのキーは同じでなければなりません。キーを追加・削除しないでください。
5. 「6. 保存する」に進みます。

### 2. 制作実績を追加する

制作実績は1件につき2つのファイルでできています。どちらも `site/src/content/works/` に入れます。

| ファイル | 内容 |
|---|---|
| スクリーンショット（例: `newsite.jpg`） | 16:9、約1600×900ピクセル、JPEG または PNG |
| 説明ファイル（例: `newsite.json`） | タイトル、カテゴリ、説明、URL、表示順 |

ファイル名には半角の英小文字・数字・ハイフン（`-`）だけを使ってください（スペースや日本語は不可）。2つのファイルは同じ名前にすると分かりやすいです。

**先に画像、次に説明ファイルの順で追加します。**（逆にすると、画像がないため途中でチェックが赤くなります。）

**A. 画像をアップロードする**
1. `site` → `src` → `content` → `works` を開きます。
2. 右上の "Add file" → "Upload files" をクリックし、画像をドラッグします。
3. "Commit changes" をクリックし、「6. 保存する」の手順で新しいブランチとプルリクエストを作ります。

**B. 同じブランチに説明ファイルを追加する**
1. 作成したプルリクエストのページ上部に「… wants to merge … into `main` from `ブランチ名`」と表示されています。その **ブランチ名** をクリックします。そのブランチのファイル一覧が開きます。
2. そこから `site` → `src` → `content` → `works` を開き、既存の `annemusic.json` を開いて、右上のコピーアイコン（"Copy raw file"）で中身をコピーします。
3. `works` フォルダに戻り、"Add file" → "Create new file" をクリックします。
4. ファイル名（例: `newsite.json`）を入力し、コピーした内容を貼り付けて、次のように書き換えます。

   ```json
   {
     "$schema": "../../../.astro/collections/works.schema.json",
     "order": 3,
     "url": "https://example.com/",
     "image": "./newsite.jpg",
     "title": { "ja": "サイト名", "en": "Site name" },
     "category": { "ja": "ホームページ制作 / STUDIO", "en": "Website / STUDIO" },
     "desc": { "ja": "日本語の説明", "en": "English description" }
   }
   ```

   | 項目 | 書き方 |
   |---|---|
   | `$schema` | そのまま。変えないでください。 |
   | `order` | 表示順。小さい数字ほど前に表示されます。数字だけを書き、`"` で囲みません。トップページには最初の4件が表示されます。 |
   | `url` | 制作したサイトのURL。`https://` から書きます。 |
   | `image` | `./` + Aでアップロードした画像のファイル名（完全に一致させてください）。 |
   | `title`, `category`, `desc` | `ja` と `en` の両方が必要です。空にはできません。 |

5. "Commit changes…" をクリックし、**"Commit directly to the `ブランチ名` branch"** を選んで "Commit changes" をクリックします。（新しいブランチは作りません。同じプルリクエストに追加されます。）

### 3. お問い合わせのリンクを変える

`site/src/data/site.json` の `contact` にあります。

```json
"contact": {
  "inquiry": "https://forms.gle/…",
  "linkedin": "",
  "coconala": ""
}
```

- リンクは `https://` から書きます。
- `""`（空）にすると、そのリンクは「準備中」と表示されます。

編集方法は「1. 文章を変える」と同じです。

### 4. 画像を差し替える

既存の制作実績の画像を差し替えるときは、新しい画像を **同じファイル名** で `site/src/content/works/` にアップロードします（"Add file" → "Upload files"）。同じ名前のファイルは上書きされます。

### 5. してはいけないこと

- `site/src/content/works/` 以外の画像や、`site/src/i18n/`・`site/src/data/`・`site/src/content/works/` 以外のファイルを変えること。（それ以外が必要なときは Matthew に相談してください。）
- キー（`:` の左側）の変更・追加・削除。

### 6. 保存する（プルリクエストを作る）

1. 編集が終わったら、右上の緑の "Commit changes…" をクリックします。
2. "Commit message" に、何を変えたかを短く書きます（例: `トップの説明文を修正`）。
3. **"Create a new branch for this commit and start a pull request"** を選びます。ブランチ名は自動で入ります（そのままで大丈夫です）。
4. "Propose changes" をクリックします。
5. 次の画面で "Create pull request" をクリックします。

### 7. プレビューで確認する

1. 約5分待ちます。プルリクエストのページ下部でチェックが動いています。
2. プルリクエストに **「Preview / プレビュー: https://pr-○○.preview.lumineglyph.com/」** というコメントが付きます。リンクを開いてください。
3. 確認すること:
   - 日本語ページと英語ページ（JP / EN で切り替え）
   - スマートフォンでも開いて確認
   - ライトモードとダークモード
4. さらに直したいときは、同じブランチのファイルを編集して "Commit directly to the `ブランチ名` branch" で保存します。プレビューは数分で更新され、コメントのコミット番号も新しくなります。

プレビューのページは検索エンジンには表示されません。ただし、このリポジトリは公開されているため、プルリクエストとプレビューのリンクは誰でも見られます。公開前の秘密の情報は入れないでください。

### 8. チェックが赤くなったら

プルリクエストのチェック（`build`）が赤い ✗ になった場合:

1. 赤い ✗ の横の "Details" をクリックします。
2. エラー文の中にファイル名が出ていることが多いです。よくある原因:
   - `.json` の `"` や `,` が消えている、または多い
   - `ja.json` と `en.json` のキーが一致していない
   - `image` のファイル名とアップロードした画像の名前が違う
   - `url` が `https://` で始まっていない
   - `order` が `"` で囲まれている
3. 該当のファイルを同じブランチで直して保存すると、チェックがやり直されます。
4. 分からないときは、プルリクエストに状況を書いて Matthew に聞いてください。

赤いチェックがある間はマージできません。間違った内容が公開されることはありません。

### 9. 公開する（マージ）

1. チェックがすべて緑の ✓ で、プレビューも確認できたら、"Merge pull request" → "Confirm merge" をクリックします。
2. 約5分で本番サイト（https://lumineglyph.com）に反映されます。プレビューは自動で削除されます。
3. "Delete branch" ボタンが出たら、押してブランチを削除して構いません。

公開した変更を元に戻したいときは Matthew に伝えてください。すぐに前の状態に戻せます。

---

## English

All copy edits and new works can be done on github.com, in the browser. Nothing to install.

**The flow:** edit a file → create a new branch and a pull request (PR) → check the preview → merge (publish)

You can't save straight to `main`; every change goes through a pull request. You see a preview before anything goes live, and nothing reaches the live site until you merge, so edit without worry.

> The button names below are GitHub's own, in quotes, such as "Commit changes…". GitHub sometimes changes their wording slightly.

### 1. Change text

The site's text lives in two files:

| File | Contents |
|---|---|
| `site/src/i18n/ja.json` | Text of the Japanese pages |
| `site/src/i18n/en.json` | Text of the English pages |

1. On github.com, open the repo and click `site` → `src` → `i18n` → `ja.json` (or `en.json`).
2. Click the pencil icon ("Edit this file") at the top right.
3. Find the text you want to change (`Ctrl+F`, or `Cmd+F` on a Mac).
4. Change it. Each line looks like `"key": "text"`:

   ```json
   "contact": "Contact",
   ```

   - **Only change the text inside the right-hand `"…"`.** Never change the key on the left.
   - Keep every `"` and `,`.
   - `\n` is a line break.
   - To quote something inside the text, use “ ” or 「」, not `"`.
   - To change both languages, edit `ja.json` and `en.json` separately. Both files must have the same keys, so don't add or remove any.
5. Go to "6. Save".

### 2. Add a work

Each work is two files, both in `site/src/content/works/`:

| File | Contents |
|---|---|
| A screenshot (for example `newsite.jpg`) | 16:9, about 1600×900 pixels, JPEG or PNG |
| A description file (for example `newsite.json`) | Title, category, description, URL, position |

Use only lowercase letters, numbers and hyphens (`-`) in file names, with no spaces or Japanese. Giving both files the same name keeps things clear.

**Add the image first, then the description file.** The other way round, the check turns red for a while because the image is missing.

**A. Upload the image**
1. Open `site` → `src` → `content` → `works`.
2. Click "Add file" → "Upload files" at the top right, and drag the image in.
3. Click "Commit changes", and follow "6. Save" to create a new branch and pull request.

**B. Add the description file to the same branch**
1. At the top of your pull request it says "… wants to merge … into `main` from `branch-name`". Click the **branch name**. That opens the files on your branch.
2. From there, open `site` → `src` → `content` → `works` → `annemusic.json`, and copy its contents with the copy icon ("Copy raw file") at the top right.
3. Go back to the `works` folder and click "Add file" → "Create new file".
4. Type the file name (for example `newsite.json`), paste, and change it like this:

   ```json
   {
     "$schema": "../../../.astro/collections/works.schema.json",
     "order": 3,
     "url": "https://example.com/",
     "image": "./newsite.jpg",
     "title": { "ja": "サイト名", "en": "Site name" },
     "category": { "ja": "ホームページ制作 / STUDIO", "en": "Website / STUDIO" },
     "desc": { "ja": "日本語の説明", "en": "English description" }
   }
   ```

   | Field | How to fill it in |
   |---|---|
   | `$schema` | Leave it exactly as it is. |
   | `order` | The position. Lower numbers come first. Just the number, with no `"` around it. The home page shows the first 4. |
   | `url` | The site you made, starting with `https://`. |
   | `image` | `./` plus the image's file name from A, exactly. |
   | `title`, `category`, `desc` | Need both `ja` and `en`, and neither can be empty. |

5. Click "Commit changes…", choose **"Commit directly to the `branch-name` branch"**, and click "Commit changes". (No new branch this time; it's added to the same pull request.)

### 3. Change the contact links

They're under `contact` in `site/src/data/site.json`:

```json
"contact": {
  "inquiry": "https://forms.gle/…",
  "linkedin": "",
  "coconala": ""
}
```

- Links start with `https://`.
- An empty `""` shows that link as "Coming soon" (準備中).

Edit it the same way as in "1. Change text".

### 4. Replace an image

To replace a work's screenshot, upload the new image to `site/src/content/works/` with the **same file name** ("Add file" → "Upload files"). It replaces the old one.

### 5. Please don't

- Change images outside `site/src/content/works/`, or files outside `site/src/i18n/`, `site/src/data/` and `site/src/content/works/`. Ask Matthew if you need something else changed.
- Change, add or remove keys (the left side of `:`).

### 6. Save (create a pull request)

1. When you're done editing, click the green "Commit changes…" at the top right.
2. Under "Commit message", say briefly what you changed (for example `Update the intro text`).
3. Choose **"Create a new branch for this commit and start a pull request"**. GitHub fills in a branch name; that's fine.
4. Click "Propose changes".
5. On the next screen, click "Create pull request".

### 7. Check the preview

1. Wait about 5 minutes. The checks run at the bottom of the pull request.
2. The pull request gets a comment **"Preview / プレビュー: https://pr-<number>.preview.lumineglyph.com/"**. Open the link.
3. Check:
   - the Japanese and the English pages (switch with JP / EN)
   - on your phone too
   - in light mode and dark mode
4. To change more, edit the files on the same branch and save with "Commit directly to the `branch-name` branch". The preview updates within a few minutes, and the comment shows the new commit.

Previews don't appear in search engines. But this repo is public, so anyone can see the pull request and its preview link. Don't put anything confidential in it before it's meant to be public.

### 8. If a check turns red

If a check on the pull request (`build`) shows a red ✗:

1. Click "Details" next to it.
2. The error usually names the file. Common causes:
   - a missing or extra `"` or `,` in a `.json` file
   - `ja.json` and `en.json` no longer have the same keys
   - the `image` name doesn't match the uploaded image
   - a `url` that doesn't start with `https://`
   - an `order` with `"` around it
3. Fix the file on the same branch and save; the checks run again.
4. If you're stuck, describe what you see in the pull request and ask Matthew.

You can't merge while a check is red, so a mistake can never go live.

### 9. Publish (merge)

1. When every check is a green ✓ and the preview looks right, click "Merge pull request" → "Confirm merge".
2. The live site (https://lumineglyph.com) updates in about 5 minutes, and the preview is deleted automatically.
3. If a "Delete branch" button appears, you can click it to tidy up.

If you ever need a published change undone, tell Matthew; it can be rolled back quickly.
