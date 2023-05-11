
export const getBtcBalance = async ({
  bitcoinRpcUrl,
  bitcoinRpcUsername,
  bitcoinRpcPassword,
  btcAddress,
}: {
  bitcoinRpcUrl: string;
  bitcoinRpcUsername: string;
  bitcoinRpcPassword: string;
  btcAddress: string;
}) => {
  let basicAuthorization =
    "Basic " +
    Buffer.from(`${bitcoinRpcUsername}:${bitcoinRpcPassword}`).toString(
      "base64"
    );
  let response = await fetch(bitcoinRpcUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      Authorization: basicAuthorization,
    },
    body: JSON.stringify({
      id: 0,
      method: `listunspent`,
      params: [0, 9999999, `[\"${btcAddress}\"]`],
    }),
  });
  let json = await response.json();
  console.log(json);
  return json;
};
