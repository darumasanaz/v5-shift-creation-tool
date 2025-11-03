# v5-shift-creation-tool

シフト自動生成と可視化を行う Next.js アプリケーションです。希望休の設定や不足シフトの確認に加え、作成したシフト表を CSV 形式でエクスポートできます。

## 開発環境のセットアップ

```bash
npm install
npm run dev
```

開発サーバーは `http://localhost:3000` で起動します。

## CSV エクスポート

- 画面右上の「エクスポート」ボタンを押すと、表示中のスタッフ順・日付順で並べられたシフト表を CSV としてダウンロードできます。
- 先頭行は `スタッフ,1日,2日,...` となり、各スタッフ行は `スタッフID` に続けて日ごとのシフトコードが並びます。
- Excel 等で文字化けしないよう UTF-8 (BOM 付き) で出力しています。

## Google Sheets への直接書き込み（オプション）

Google Sheets API を利用して直接スプレッドシートへ書き込むモードを追加する場合は、以下の手順で OAuth 認証とトークン取得を行ってください。

1. [Google Cloud Console](https://console.cloud.google.com/) で新しいプロジェクトを作成し、Google Sheets API を有効化します。
2. 認証情報メニューから「OAuth クライアント ID」を作成し、アプリケーション種別に「デスクトップ アプリ」または「ウェブアプリ」を選択します。
3. ダウンロードした `credentials.json` をリポジトリ直下の `credentials/credentials.json` として配置します（`.gitignore` に含めてください）。
4. `.env.local` に以下の環境変数を設定します。

   ```env
   GOOGLE_SHEETS_CLIENT_ID=YOUR_CLIENT_ID
   GOOGLE_SHEETS_CLIENT_SECRET=YOUR_CLIENT_SECRET
   GOOGLE_SHEETS_REDIRECT_URI=http://localhost:3000/api/google/oauth2callback
   GOOGLE_SHEETS_TOKEN_PATH=credentials/token.json
   GOOGLE_SHEETS_TARGET_SPREADSHEET_ID=<<書き込み先スプレッドシートID>>
   GOOGLE_SHEETS_TARGET_RANGE=シート名!A1
   ```

5. サーバー側（`app/api` 配下）に OAuth コールバックとトークン保存用のエンドポイントを実装し、初回アクセス時に Google の同意画面へリダイレクトするようにします。取得したリフレッシュトークンは `GOOGLE_SHEETS_TOKEN_PATH` で指定したパスに保存してください。
6. 書き込み処理では [`googleapis`](https://www.npmjs.com/package/googleapis) を用い、`sheets.spreadsheets.values.update` あるいは `append` を呼び出して CSV と同じ行列データを反映させます。

> **メモ:** 上記の OAuth 設定とトークン取得フローを整えた上で、UI に「Google Sheets へ送信」ボタンを追加すればダイレクトにシフト表をアップロードできるようになります。トークンや機密情報は Git 管理対象に含めないよう注意してください。
