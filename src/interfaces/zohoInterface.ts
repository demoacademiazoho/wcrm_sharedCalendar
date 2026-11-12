/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ZohoInterface {
    embeddedApp: {
      on: (event: string, callback: Function) => void;
      init: () => Promise<any>;
    };
    CRM: {
      ACTION: {
        setConfig: (object: any) => Promise<any>;
        enableAccountAccess: (object: any) => Promise<any>;
      };
      FUNCTIONS: {
        execute: (customFunctionName: string, data: any) => Promise<any>;
      };
      CONFIG: {
        getOrgInfo: () => Promise<any>;
        getCurrentUser: () => Promise<any>;
        getCurrentEnvironment: () => Promise<any>;
      };
      API: {
        getAllUsers: (Object: {
          Type: string;
          page: number;
          per_page: number;
        }) => Promise<any>;
        getUser: (Object: { ID: string }) => Promise<any>;
        getOrgVariable: (arg0: string) => Promise<any>;
        coql: (data: { select_query: string }) => Promise<any>;
        updateRecord: (data: {
          Entity: string;
          APIData: object;
          Trigger?: string[];
        }) => Promise<any>;
      };
      META: {
        getFields: (Object: { Entity: string }) => Promise<any>;
      };
      UI: {
        Resize: (Object: { width: number; height: number }) => Promise<any>;
        Dialer: {
          maximize: () => Promise<any>;
          minimize: () => Promise<any>;
          notify: () => Promise<any>;
        };
        Record: {
          open: (data: {
            Entity: string;
            RecordID: string;
            target: string;
          }) => Promise<any>;
          edit: (data: {
            Entity: string;
            RecordID: string;
            target: string;
          }) => Promise<any>;
          create: (data: {
            Entity: string;
            RecordID: string;
            target: string;
          }) => Promise<any>;
          populate: (data: any) => Promise<any>;
        };
        Popup: {
          close: () => Promise<any>;
          closeReload: () => Promise<any>;
        };
        Widget: {
          open: (data: any) => Promise<any>;
        };
        // Add other UI properties based on the actual code
      };
      CONNECTION: {
        invoke: (nameSpace: string, data: any) => Promise<any>;
      };
      // Add other CRM properties based on the actual code
      HTTP: {
        get: (data: any) => Promise<any>;
        post: (data: any) => Promise<any>;
        put: (data: any) => Promise<any>;
        patch: (data: any) => Promise<any>;
        delete: (data: any) => Promise<any>;
      };
      CONNECTOR: {
        invokeAPI: (nameSpace: string, data: any) => Promise<any>;
        authorize: (nameSpace: string, data: any) => Promise<any>;
      };
      WIZARD: {
        post: (data: any) => Promise<any>;
      };
      BLUEPRINT: {
        proceed: () => Promise<any>;
      };
    };
    // Add other properties based on the actual code
  }
  