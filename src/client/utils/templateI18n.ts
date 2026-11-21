import { RemoteFieldSchema, RemoteProviderTemplate } from '../../shared/types';
import { LocaleCode } from '../i18n';

interface FieldTranslation {
  label?: string;
  placeholder?: string;
  helpText?: string;
  options?: Record<string, string>;
}

interface TemplateTranslation {
  name?: string;
  subtitle?: string;
  fields?: Record<string, FieldTranslation>;
}

const TEMPLATE_I18N: Record<'zh-TW' | 'en', Record<string, TemplateTranslation>> = {
  en: {
    s3: {
      name: 'Amazon S3 / R2 / MinIO / OSS',
      subtitle: 'Compatible with all S3 object storage (AWS, Cloudflare R2, MinIO, Alibaba OSS, Tencent COS)',
      fields: {
        provider: {
          label: 'S3 Provider',
          options: {
            AWS: 'Amazon Web Services (AWS S3)',
            Cloudflare: 'Cloudflare R2 Storage',
            Minio: 'MinIO Object Storage',
            Alibaba: 'Alibaba Cloud OSS',
            TencentCOS: 'Tencent Cloud COS',
            DigitalOcean: 'DigitalOcean Spaces',
            Wasabi: 'Wasabi Hot Cloud Storage',
            Other: 'Other S3 Compatible / Backblaze B2',
          },
        },
        access_key_id: { label: 'Access Key ID' },
        secret_access_key: { label: 'Secret Access Key' },
        region: { label: 'Region', placeholder: 'us-east-1 / auto / cn-hangzhou' },
        endpoint: {
          label: 'Custom Endpoint URL',
          placeholder: 'https://<accountid>.r2.cloudflarestorage.com or http://minio:9000',
          helpText: 'Required for Cloudflare R2, MinIO, OSS, COS, or self-hosted S3',
        },
        force_path_style: {
          label: 'Force Path Style (Recommended true for MinIO)',
          options: {
            false: 'False (Virtual-hosted style — AWS/R2/OSS default)',
            true: 'True (Path style — Self-hosted MinIO/Ceph)',
          },
        },
      },
    },
    webdav: {
      name: 'WebDAV / Alist / Nextcloud / Synology',
      subtitle: 'Connect to Alist, OpenList, Nextcloud, OwnCloud, or Synology NAS WebDAV',
      fields: {
        url: { label: 'WebDAV Service URL', placeholder: 'https://alist.example.com/dav' },
        vendor: {
          label: 'Server Vendor',
          options: {
            other: 'Other / Alist / Generic WebDAV',
            nextcloud: 'Nextcloud',
            owncloud: 'OwnCloud',
            sharepoint: 'SharePoint Online',
            rclone: 'Fastmail / rclone',
          },
        },
        user: { label: 'Username' },
        pass: {
          label: 'Password',
          placeholder: 'Plaintext password (automatically obscured via rclone obscure on save)',
        },
      },
    },
    sftp: {
      name: 'SFTP / SSH Remote Server',
      subtitle: 'Securely connect to remote Linux servers or NAS storage over SSH',
      fields: {
        host: { label: 'Host / IP Address', placeholder: '192.168.1.100 or server.example.com' },
        port: { label: 'SSH Port' },
        user: { label: 'SSH Username' },
        pass: { label: 'SSH Password', placeholder: 'Leave blank to use SSH key authentication' },
        key_file: { label: 'Private Key Path', placeholder: '/config/id_rsa (optional)' },
      },
    },
    smb: {
      name: 'SMB / CIFS Network Share',
      subtitle: 'Connect to Windows shares, Samba, Synology, UGREEN, TrueNAS LAN shares',
      fields: {
        host: { label: 'SMB Server Host / IP' },
        port: { label: 'Port' },
        user: { label: 'Username' },
        pass: { label: 'Password', placeholder: 'Enter SMB password' },
        domain: { label: 'Domain / Workgroup' },
      },
    },
    ftp: {
      name: 'FTP / FTPS Server',
      subtitle: 'Standard FTP protocol with explicit and implicit TLS support',
      fields: {
        host: { label: 'FTP Host' },
        port: { label: 'Port' },
        user: { label: 'Username' },
        pass: { label: 'Password' },
      },
    },
    drive: {
      name: 'Google Drive',
      subtitle: 'Connect to personal Google Drive or Team / Shared Drives',
      fields: {
        client_id: { label: 'OAuth Client ID (optional, recommended)' },
        client_secret: { label: 'OAuth Client Secret (optional)' },
        scope: {
          label: 'Access Scope',
          options: {
            drive: 'Full Access (drive)',
            'drive.readonly': 'Read-Only Access (drive.readonly)',
            'drive.file': 'Files created by rclone only (drive.file)',
          },
        },
        token: {
          label: 'OAuth Token JSON (from rclone authorize)',
          helpText: 'In headless Docker, run `rclone authorize "drive"` locally and paste the Token JSON here, or use a Service Account',
        },
        service_account_file: { label: 'Service Account JSON Path (optional)' },
        team_drive: { label: 'Team Drive / Shared Drive ID (optional)' },
      },
    },
    onedrive: {
      name: 'Microsoft OneDrive / SharePoint',
      subtitle: 'Connect to Personal, Business, 21Vianet (CN) OneDrive or SharePoint',
      fields: {
        region: {
          label: 'Region',
          options: {
            global: 'Global (Standard)',
            cn: 'CN (21Vianet China)',
            us: 'US Government',
            de: 'Germany',
          },
        },
        client_id: { label: 'Client ID (optional)' },
        client_secret: { label: 'Client Secret (optional)' },
        token: {
          label: 'OAuth Token JSON',
          helpText: 'Run `rclone authorize "onedrive"` locally to obtain the Token JSON',
        },
        drive_id: { label: 'Drive ID (optional)' },
        drive_type: {
          label: 'Drive Type',
          options: {
            personal: 'Personal',
            business: 'Business',
            documentLibrary: 'DocumentLibrary (SharePoint)',
          },
        },
      },
    },
    alias: {
      name: 'Alias / Local Directory Mapping',
      subtitle: 'Wrap any local folder (e.g. /media/backup) or remote subpath as an independent Remote',
      fields: {
        remote: {
          label: 'Target Remote or Local Path',
          placeholder: '/media or my_s3:bucket/subfolder',
          helpText: 'Supports container local paths (e.g. /media/movies) or existing remote subpaths',
        },
      },
    },
    crypt: {
      name: 'Crypt End-to-End Encrypted Storage',
      subtitle: 'Layer transparent file content and filename encryption on top of any existing Remote',
      fields: {
        remote: { label: 'Base Storage Path (Remote:Path)' },
        filename_encryption: {
          label: 'Filename Encryption Mode',
          options: {
            standard: 'Standard (Full filename encryption)',
            obfuscate: 'Obfuscate (Simple filename obfuscation)',
            off: 'Off (Encrypt file contents only)',
          },
        },
        password: { label: 'Master Password', placeholder: 'Enter a strong master password' },
        password2: {
          label: 'Salt Password2 (optional)',
          placeholder: 'Strongly recommended secondary salt password',
        },
      },
    },
  },
  'zh-TW': {
    s3: {
      name: 'Amazon S3 / R2 / MinIO / OSS',
      subtitle: '相容所有 S3 協定物件儲存 (AWS, Cloudflare R2, MinIO, 阿里雲 OSS, 騰訊雲 COS)',
      fields: {
        provider: {
          label: 'S3 服務供應商 (Provider)',
          options: {
            Alibaba: 'Alibaba Cloud OSS (阿里雲)',
            TencentCOS: 'Tencent Cloud COS (騰訊雲)',
          },
        },
        region: { label: 'Region (區域)' },
        endpoint: {
          label: 'Endpoint URL (自訂端點)',
          placeholder: 'https://<accountid>.r2.cloudflarestorage.com 或 http://minio:9000',
          helpText: '使用 Cloudflare R2、MinIO 或自建物件儲存時必填',
        },
        force_path_style: {
          label: 'Force Path Style (MinIO 推薦 true)',
          options: {
            false: 'False (虛擬主機風格 - AWS/R2/OSS 預設)',
            true: 'True (路徑風格 - 自建 MinIO/Ceph 推薦)',
          },
        },
      },
    },
    webdav: {
      name: 'WebDAV / Alist / Nextcloud / 群暉',
      subtitle: '連線 Alist、OpenList、Nextcloud、OwnCloud、堅果雲或群暉 NAS WebDAV',
      fields: {
        url: { label: 'WebDAV 服務位址 (URL)' },
        vendor: {
          label: '伺服器類型 (Vendor)',
          options: { other: 'Other / Alist / 通用 WebDAV' },
        },
        user: { label: '使用者名稱 (User)' },
        pass: {
          label: '密碼 (Password)',
          placeholder: '輸入明文密碼 (儲存時自動透過 rclone obscure 加密)',
        },
      },
    },
    sftp: {
      name: 'SFTP / SSH 遠端伺服器',
      subtitle: '透過 SSH 協定安全連線遠端 Linux 伺服器或 NAS 儲存空間',
      fields: {
        host: { label: '主機位址 (Host / IP)', placeholder: '192.168.1.100 或 server.example.com' },
        port: { label: 'SSH 連接埠 (Port)' },
        user: { label: 'SSH 使用者名稱 (User)' },
        pass: { label: 'SSH 密碼 (Password)', placeholder: '留空則使用金鑰驗證' },
        key_file: { label: '私鑰路徑 (Key File)', placeholder: '/config/id_rsa (選填)' },
      },
    },
    smb: {
      name: 'SMB / CIFS 區域網路共享',
      subtitle: '連線 Windows 共享資料夾、Samba、群暉/綠聯/TrueNAS 區域網路共享',
      fields: {
        host: { label: 'SMB 伺服器位址 (Host)' },
        port: { label: '連接埠 (Port)' },
        user: { label: '使用者名稱 (User)' },
        pass: { label: '密碼 (Password)', placeholder: '輸入 SMB 密碼' },
        domain: { label: '網域 / 工作群組 (Domain)' },
      },
    },
    ftp: {
      name: 'FTP / FTPS 伺服器',
      subtitle: '標準檔案傳輸協定支援，相容顯式與隱式 TLS',
      fields: {
        host: { label: 'FTP 主機位址' },
        port: { label: '連接埠' },
        user: { label: '使用者名稱' },
        pass: { label: '密碼' },
      },
    },
    drive: {
      name: 'Google Drive',
      subtitle: '連線 Google 雲端硬碟或團隊共用雲端硬碟 (Team Drive)',
      fields: {
        client_id: { label: 'OAuth Client ID (選填，強烈推薦自建)' },
        client_secret: { label: 'OAuth Client Secret (選填)' },
        scope: {
          label: '存取權限範圍 (Scope)',
          options: {
            drive: '完全存取權限 (drive)',
            'drive.readonly': '唯讀存取權限 (drive.readonly)',
            'drive.file': '僅存取 rclone 建立的檔案 (drive.file)',
          },
        },
        token: {
          label: 'OAuth Token JSON (由 rclone authorize 產生)',
          helpText: '在無頭容器中可透過 `rclone authorize "drive"` 取得 Token JSON 貼上於此，或使用 Service Account',
        },
        service_account_file: { label: 'Service Account JSON 路徑 (選填)' },
        team_drive: { label: 'Team Drive / Shared Drive ID (選填)' },
      },
    },
    onedrive: {
      name: 'Microsoft OneDrive / SharePoint',
      subtitle: '連線微軟個人版、商務版、世紀互聯版 OneDrive 或 SharePoint',
      fields: {
        region: {
          label: '版本區域 (Region)',
          options: {
            global: 'Global (全球標準版)',
            cn: 'CN (世紀互聯中國版)',
          },
        },
        client_id: { label: 'Client ID (選填)' },
        client_secret: { label: 'Client Secret (選填)' },
        token: {
          label: 'OAuth Token JSON',
          helpText: '可透過本機執行 `rclone authorize "onedrive"` 取得 Token JSON',
        },
        drive_id: { label: 'Drive ID (選填)' },
        drive_type: {
          label: 'Drive Type',
          options: {
            personal: 'Personal (個人版)',
            business: 'Business (商務版)',
            documentLibrary: 'DocumentLibrary (SharePoint)',
          },
        },
      },
    },
    alias: {
      name: 'Alias 路徑別名 / 本機目錄對應',
      subtitle: '將任意本機路徑 (如 /media/backup) 或遠端子目錄封裝為獨立 Remote',
      fields: {
        remote: {
          label: '目標路徑或遠端 (Target Remote / Local Path)',
          placeholder: '/media 或 my_s3:bucket/subfolder',
          helpText: '支援容器內本機目錄（如 /media/movies）或已有 Remote 子路徑',
        },
      },
    },
    crypt: {
      name: 'Crypt 端對端加密儲存',
      subtitle: '在任意已有 Remote 之上疊加透明的檔案內容與檔名加密層',
      fields: {
        remote: { label: '底層加密儲存路徑 (Base Remote:Path)' },
        filename_encryption: {
          label: '檔名加密模式',
          options: {
            standard: 'Standard (完全加密檔名)',
            obfuscate: 'Obfuscate (輕度混淆檔名)',
            off: 'Off (不加密檔名，僅加密檔案內容)',
          },
        },
        password: { label: '主加密密碼 (Password)', placeholder: '輸入高強度主密碼' },
        password2: {
          label: '鹽值密碼 (Salt Password2，選填)',
          placeholder: '強烈建議設定第二組密碼作為 Salt',
        },
      },
    },
  },
};

export function localizeTemplate(
  tpl: RemoteProviderTemplate,
  locale: LocaleCode
): RemoteProviderTemplate {
  if (locale === 'zh-CN') return tpl;
  const map = TEMPLATE_I18N[locale]?.[tpl.type];
  if (!map) return tpl;

  return {
    ...tpl,
    name: map.name || tpl.name,
    subtitle: map.subtitle || tpl.subtitle,
    fields: tpl.fields.map((field): RemoteFieldSchema => {
      const fMap = map.fields?.[field.key];
      if (!fMap) return field;
      return {
        ...field,
        label: fMap.label || field.label,
        placeholder: fMap.placeholder ?? field.placeholder,
        helpText: fMap.helpText ?? field.helpText,
        options: field.options?.map((opt) => ({
          ...opt,
          label: fMap.options?.[opt.value] || opt.label,
        })),
      };
    }),
  };
}
