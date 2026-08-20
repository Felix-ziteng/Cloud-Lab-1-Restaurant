import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GuestOrderToken, StoreConfig } from '@restaurant/shared-types';
import { api, setToken } from '../api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

// 顾客换了设备、或者清了浏览器缓存，手里没有订单链接了——用"订单号 + 下单手机号"重新
// 找回订单（没有短信验证码这一关，见 OrdersService.lookupGuestOrder 的取舍说明）
export default function TrackOrderPage() {
  const navigate = useNavigate();
  const [orderNumber, setOrderNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState<StoreConfig | null>(null);

  useEffect(() => {
    api.get<StoreConfig>('/store-config').then(setConfig).catch(() => {});
  }, []);

  async function lookup(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!orderNumber.trim() || !phone.trim()) {
      setError('请填写订单号和手机号');
      return;
    }

    setBusy(true);
    try {
      const res = await api.get<GuestOrderToken>(
        `/orders/lookup?orderNumber=${encodeURIComponent(orderNumber)}&phone=${encodeURIComponent(phone)}`,
      );
      setToken(`guest-order:${res.orderId}`, res.token);
      navigate(`/order-status/${res.orderId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '查询失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  if (config && !config.deliveryEnabled) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="mx-auto max-w-sm text-center">
          <h1 className="text-lg font-semibold text-foreground">查询订单</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            该门店暂未开放外卖/自提自助下单，请到店点餐或联系店员代下单。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>查询订单</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={lookup} className="flex flex-col gap-3">
            <Input
              placeholder="订单号（下单成功页上显示的数字）"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
            />
            <Input placeholder="下单时留的手机号" value={phone} onChange={(e) => setPhone(e.target.value)} />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy}>
              查询
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
