# PEEK-A-BOO Reception Recruit

PEEK-A-BOOのレセプション採用ページです。
応募ページ本体は静的HTML、管理画面の設定保存はNetlify FunctionsとNetlify Blobsで動きます。

## GitHubへアップする手順

GitHubで新しいリポジトリを作成してから、このフォルダで以下を実行します。

```powershell
cd "C:\Users\CL16-1\Documents\Codex\2026-07-07\peek-a-boo-peek-a-boo\github_netlify_repo"
git remote add origin https://github.com/harada-peekaboo/peekaboo.git
git push -u origin main
```

## Netlify側の設定

NetlifyでGitHubリポジトリを選んでデプロイします。

- Build command: `npm run build`
- Publish directory: `outputs/static_site`
- Functions directory: `netlify/functions`

この3つは `netlify.toml` に入っているため、通常は自動で読み込まれます。

## 必要な環境変数

管理画面をサーバー連動にするため、NetlifyのEnvironment variablesに追加します。

- `NETLIFY_BLOBS_TOKEN`: NetlifyのPersonal Access Token
- `ADMIN_SESSION_SECRET`: ランダムな長い文字列

Scopesを選ぶ画面が出たら `Functions` を含めます。迷う場合はAll scopesで大丈夫です。
設定後は必ず再デプロイしてください。

## 動作確認

デプロイ後、以下を開きます。

```text
https://サイトURL/api/health
```

`functions: true` が出ればFunctionsは動いています。
`blobsConfig.token` が `true` になれば、Blobs保存用トークンもFunctionsで読めています。

管理画面は以下です。

```text
https://サイトURL/#admin
```

初期パスワードは `peekaboo2026` です。
