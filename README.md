# Runbookle

Runbookle は [https://nacookan.github.io/runbookle/](https://nacookan.github.io/runbookle/) で利用できます。
PWAとしてホーム画面に追加して使うのがおすすめです。iPhoneのSafariでは、共有メニューから「ホーム画面に追加」を選んでください。

Runbookle は、1日または数日間の行動予定を作るためのWebアプリです。旅行、出張、イベント参加日、複数予定がある日などに使う、時刻付きの行動メモ / 進行表に近いアプリを目指します。データはユーザー自身の Google Drive または Dropbox に保存します（接続時にどちらかを選択）。

ユーザー名、メールアドレス、プロフィール画像は取得しません。作者のサーバーや作者のDBにも、ユーザーのメモや予定データを保存しません。

![Runbookle の編集画面](docs/screen1.png)

## 技術スタック

- Vite
- React
- TypeScript
- CSS Modules
- PWA最小設定
- GitHub Pages
- GitHub Actions
- Google Identity Services
- Google Drive API v3
- Dropbox API v2

## ローカル開発

```bash
npm install
npm run dev
```

Vite の `base` は `/runbookle/` に設定しています。ローカルでは次のURLで確認します。

```text
http://localhost:5173/runbookle/
```

## .env.local

ローカル開発では `.env.local` を作成し、Google OAuth Client ID と Dropbox App Key を設定します。

```env
VITE_GOOGLE_CLIENT_ID=xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com
VITE_DROPBOX_APP_KEY=xxxxxxxxxxxxxxx
```

`VITE_GOOGLE_CLIENT_ID` は Google Identity Services のブラウザ向けOAuth連携に使う OAuth Client ID です。`VITE_DROPBOX_APP_KEY` は Dropbox OAuth (PKCE) に使う App Key です。どちらも秘密情報ではありませんが、環境ごとの差し替えを容易にし、ソースコードへ直書きしない方針です。未設定のプロバイダの接続ボタンは無効になります。

Client Secret / App Secret は静的ホスティングのブラウザアプリでは使いません。ソースコード、環境変数、GitHub Actions のいずれにも設定しないでください。

## Google Cloud Console のOAuth設定

Google Cloud Console で OAuth クライアントを作成し、Google Drive API を有効化します。

- アプリケーションの種類: ウェブ アプリケーション
- 承認済みの JavaScript 生成元:
  - `http://localhost:5173`
  - `http://127.0.0.1:5173`
  - `https://<GitHubユーザー名>.github.io`
- 承認済みのリダイレクト URI: 今回の Google Identity Services OAuth token flow では不要

GitHub Pages の公開URLが `https://<GitHubユーザー名>.github.io/runbookle/` の場合でも、承認済み JavaScript 生成元には origin の `https://<GitHubユーザー名>.github.io` を登録します。

## Dropbox App Console のOAuth設定

[Dropbox App Console](https://www.dropbox.com/developers/apps) でアプリを作成します。

- アクセスタイプ: App folder（アプリ専用フォルダのみアクセス）
- Permissions: `files.metadata.read`、`files.content.read`、`files.content.write`
- Redirect URIs:
  - `http://localhost:5173/runbookle/`
  - `http://127.0.0.1:5173/runbookle/`
  - `https://<GitHubユーザー名>.github.io/runbookle/`

Redirect URI は末尾のスラッシュまで完全一致で登録します。認可は authorization code flow + PKCE を使い、App Secret は使いません。`token_access_type=offline` で refresh token を取得するため、Google Driveと違って接続が長期間維持されます。

作成直後のアプリは Development ステータスで、接続できるユーザーは500人までです。

## ストレージ保存

接続時に Google Drive と Dropbox のどちらかを選択します。同時利用はできません。プロバイダ間でデータを移す場合は、ZIPエクスポート/インポートを使います。

### Google Drive

Google Drive API v3 を使い、ユーザー本人の Google Drive `appDataFolder` に次のファイルを保存します。

```text
runbookle-data.json
```

OAuth スコープは次のみです。

```text
https://www.googleapis.com/auth/drive.appdata
```

`drive.appdata` は、アプリ専用の隠しデータ領域である `appDataFolder` へアクセスするためのスコープです。通常のDriveファイル全体へのアクセス権限は要求しません。また、ユーザー名、メールアドレス、プロフィール画像を取得するスコープも要求しません。

添付ファイルは `runbookle-data.json` とは別に、`appDataFolder` 内の個別ファイルとして保存します。各ファイルの `appProperties` にRunbookのIDを記録し、紐付けます。

### Dropbox

Dropbox API v2 を使い、App folder（ユーザーのDropbox内 `アプリ/<アプリ名>/`）に保存します。Google Driveの `appDataFolder` と違い、このフォルダはユーザーから見えます。

```text
/runbookle-data.json
/attachments/<runbookId>/<ファイル名>
```

同名ファイルをアップロードした場合は、Dropboxのautorenameで `name (1).ext` のような名前になります。Dropboxのメタデータには mimeType がないため、プレビュー判定は拡張子から推定します。

### 保存形式

保存形式はJSONです。

```json
{
  "schemaVersion": 1,
  "runbooks": [
    {
      "id": "string",
      "title": "string",
      "startDate": {
        "year": 2026,
        "month": 6,
        "day": 8,
        "precision": "day"
      },
      "endDate": {
        "mode": "none",
        "year": null,
        "month": null,
        "day": null,
        "precision": null
      },
      "archived": false,
      "text": "string",
      "createdAt": "ISO string",
      "updatedAt": "ISO string"
    }
  ],
  "updatedAt": "ISO string"
}
```

ストレージ上に `runbookle-data.json` がなければ作成し、あれば読み込みます。入力内容は `localStorage` にもキャッシュし、読み込み前や保存失敗時にも最後のローカル内容を表示できるようにしています。添付ファイルは `localStorage` にキャッシュせず、ストレージ接続時のみ利用できます。

ハンバーガーメニューから、Runbookデータと添付ファイルをまとめたZIPファイルをエクスポート/インポートできます。インポートは現在のRunbookデータと添付ファイルを置き換えます。

```text
runbookle-export.zip
  runbookle-data.json
  attachments.json
  attachments/
    <runbookId>/
      <attachmentId>/
        <fileName>
```

## 日付とアーカイブ

Runbook の開始日は未定を許可します。`startDate.precision` は次の値です。

```text
none, year, month, day
```

データ形式としては、終了日に「なし」「未定」「日付指定」を保持できます。

- `endDate.mode: "none"`: 1日だけの予定として扱います。
- `endDate.mode: "unknown"`: 終了日未定として扱います。
- `endDate.mode: "date"`: 終了日の年月日情報を使います。

現在のUIでは、終了日が空欄の場合は「なし」として扱います。

一覧画面は「今後の予定」と「アーカイブ」に分かれます。`archived: true` のRunbookと、日付が過ぎたRunbookはアーカイブに表示されます。過去日付のRunbookはアーカイブ解除できません。日付未定のRunbookは今後の予定に表示されます。

今後の予定は開始日の昇順で表示します。

## 本文エディタ

編集画面の本文エディタはプレーンテキストを保存します。1行目をRunbookのタイトル、2行目以降を本文として扱います。

編集画面ツールバーの「検証」から本文を簡易解析できます。`1000 1030` や `10:00 10:30` のように同じ行に開始時刻と終了時刻がある場合だけ、明らかな矛盾を検出します。

- 開始時刻より終了時刻が前の行
- 同じ日の中で時刻が前後している行
- 時間帯が重なっている予定
- 予定と予定の間の空き時間

行頭が `##` の行は、任意の日付区切りとして扱います。`## 2026-7-1` のように日付を書いても、`##` だけでも区切りになります。区切り内では、時刻順、時間帯の重なり、空き時間を検証します。区切りがない本文では、本文全体を1日の予定として検証します。

Markdown風チェックボックス記法の `- [ ]` と `- [x]` は、本文内ではプレーンテキストとして保存します。エディタ上ではクリックでチェック状態を切り替えられます。

時刻入力では、`1000` のような3桁または4桁の数字から `10:00` 形式への補完、既存時刻の前後調整候補、同じ行にある開始時刻と終了時刻からの所要時間表示を行います。

## 添付ファイル

編集画面ツールバーの「添付」（クリップアイコン）から、Runbookごとの添付ファイル一覧を開けます。添付があるRunbookではツールバーの表示が「添付あり」になり、アイコンに件数バッジが表示されます。一覧画面でも、添付があるRunbookのタイトル横にクリップアイコンが表示されます。

添付ファイル一覧画面の「ファイルを追加」から、画像やファイルを選んでアップロードします。ファイル名はそのまま使い、リサイズなどの加工は行いません。

一覧の項目をタップするとプレビューを開きます。画像とPDFはその場で表示し、画像はタップで全体表示と拡大表示を切り替えられます（拡大時はドラッグでスクロールします）。それ以外のファイル形式では、ダウンロードボタンを表示します。

プレビュー画面のハンバーガーメニューから、表示中のファイルを削除できます。

## GitHub Pages へのデプロイ

公開する段階になったら、GitHub リポジトリの Settings で Pages の Source を `GitHub Actions` に設定します。

GitHub Actions の Variables に次を登録します。

```text
VITE_GOOGLE_CLIENT_ID
VITE_DROPBOX_APP_KEY
```

登録場所は Repository settings の `Secrets and variables` -> `Actions` -> `Variables` です。Client ID / App Key は秘密情報ではないため Variables で扱います。

`main` ブランチへ push すると、`.github/workflows/deploy.yml` が `npm ci`、`npm run build` を実行し、`dist` を GitHub Pages にデプロイします。

## コマンド

```bash
npm run dev
npm run build
npm run preview
```
