// Type declarations for Google APIs (loaded via script tags)

declare namespace google {
  namespace accounts {
    namespace oauth2 {
      interface TokenClient {
        callback: (response: TokenResponse) => void;
        requestAccessToken: (options?: { prompt?: string }) => void;
      }

      interface TokenResponse {
        access_token?: string;
        error?: string;
      }

      function initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
      }): TokenClient;

      function revoke(token: string, callback: () => void): void;
    }
  }
}

declare namespace gapi {
  function load(api: string, callback: () => void): void;

  namespace client {
    function init(config: {
      apiKey?: string;
      discoveryDocs?: string[];
    }): Promise<void>;

    namespace drive {
      namespace files {
        function list(params: {
          spaces?: string;
          q?: string;
          fields?: string;
        }): Promise<{
          result: {
            files?: Array<{
              id?: string;
              name?: string;
              modifiedTime?: string;
            }>;
          };
        }>;
      }
    }
  }
}
