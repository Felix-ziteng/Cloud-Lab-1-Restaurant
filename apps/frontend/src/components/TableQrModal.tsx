import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

// 扫码点餐弹层：给桌台平板用，弹出这一桌自己的点餐链接二维码，客人拿手机一扫就跟平板
// 共用同一桌的购物车（同一个 tableId -> /order/<tableId> -> joinOrAutoOpen 幂等加入，
// 拿到的是同一个 orderId）。链接跟以后要贴在桌上的二维码应该是同一个（同样编码
// /order/<tableId>），所以这里不额外发明一套"平板专属"的链接格式。
export default function TableQrModal({
  tableId,
  tableNumber,
  onClose,
}: {
  tableId: string;
  tableNumber: string;
  onClose: () => void;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const url = `${window.location.origin}/order/${tableId}`;

  useEffect(() => {
    QRCode.toDataURL(url, { width: 280, margin: 1 })
      .then(setDataUrl)
      .catch(() => setDataUrl(null));
  }, [url]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex w-full items-center justify-between">
          <h2 className="text-base font-bold text-foreground">桌台 {tableNumber} · 扫码点餐</h2>
          <button type="button" onClick={onClose} className="text-xl text-muted-foreground">
            ×
          </button>
        </div>

        <p className="text-center text-sm text-muted-foreground">用手机扫一下，就能跟这台平板一起点这一桌的菜</p>

        {dataUrl ? (
          <img src={dataUrl} alt="点餐二维码" className="size-[280px]" />
        ) : (
          <div className="flex size-[280px] items-center justify-center text-sm text-muted-foreground">
            二维码生成中…
          </div>
        )}

        <p className="break-all text-center text-xs text-muted-foreground">{url}</p>
      </div>
    </div>
  );
}
