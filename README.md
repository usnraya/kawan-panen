# Kawan Panen

Demo AgriLink Bali untuk menghubungkan kebutuhan buyer dengan pasokan petani melalui matching rule-based, fallback pemasok, dan checkout Midtrans Snap.

> Semua data aplikasi bersifat simulasi. Jangan masukkan data operasional nyata.

## Stack

- Next.js 16 App Router + TypeScript
- Supabase Auth/Postgres + RLS
- Midtrans Snap sandbox untuk pembayaran
- Vitest untuk unit test

## Menjalankan lokal

1. Install dependency:

   ```powershell
   npm install
   ```

2. Buat `.env.local`:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   CRON_SECRET=...
   MIDTRANS_SERVER_KEY=SB-Mid-server-...
   NEXT_PUBLIC_MIDTRANS_CLIENT_KEY=SB-Mid-client-...
   ```

   `SUPABASE_SERVICE_ROLE_KEY`, `MIDTRANS_SERVER_KEY`, dan `CRON_SECRET` hanya untuk server. Jangan commit atau kirim nilainya ke browser.

3. Pastikan schema di `supabase/schema.sql` sudah dijalankan pada project Supabase.

4. Seed akun dan data simulasi:

   ```powershell
   npm run seed
   ```

5. Jalankan aplikasi:

   ```powershell
   npm run dev
   ```

   Buka <http://localhost:3000>.

## Akun demo

Semua akun memakai password simulasi yang sama: `Simulasi-Aman-123!`.

| Peran | Email |
| --- | --- |
| Buyer | `pembeli.simulasi@example.test` |
| Koordinator | `koordinator.simulasi@example.test` |
| Petani | `petani.simulasi@example.test` |

Akun petani simulasi lain tersedia di `scripts/seed-auth.mjs`.

## Skrip demo end-to-end

1. Login sebagai buyer dengan `pembeli.simulasi@example.test`.
2. Buka **Ketersediaan**, pilih Tomat, masukkan minimal 20 kg, lalu tambahkan ke keranjang.
3. Buka keranjang. Pastikan stok tervalidasi, total, supplier, grade, dan tanggal pengiriman terlihat sebelum checkout.
4. Checkout. Atur `PAYMENT_PROVIDER=midtrans` dan `MIDTRANS_SERVER_KEY` untuk Snap sandbox. Untuk simulasi lokal tanpa provider, atur `PAYMENT_PROVIDER=mock` secara eksplisit; jangan gunakan mock pada deployment produksi.
5. Login sebagai koordinator dengan `koordinator.simulasi@example.test`.
6. Buka **Ruang demo** di `/coordinator/demo`.
7. Jalankan simulasi kegagalan pemasok utama.
8. Amati pemasok cadangan dipromosikan dan shortfall dihitung ulang.
9. Gunakan **Hub & QC** untuk melihat verifikasi stok, QC, serta progres fulfillment.
10. Gunakan **Komplain** untuk melihat alur dispute dan refund ledger bila ada pesanan disputed.

Navigasi koordinator tersedia di `/coordinator/dashboard`, `/coordinator/hub`, `/coordinator/disputes`, dan `/coordinator/demo`.

## Sweep operasional

Vercel memanggil `/api/cron/sweep` setiap 5 menit melalui `vercel.json`. Endpoint membutuhkan `CRON_SECRET` dan menjalankan:

- pelepasan stock reservation yang kedaluwarsa untuk order unpaid;
- pengecekan deadline konfirmasi farmer dan fallback.

Untuk pengujian lokal, kirim header `Authorization: Bearer <CRON_SECRET>` tanpa menaruh nilai secret di log atau chat.

## Verifikasi sebelum deploy

```powershell
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Deploy production hanya setelah environment variables, migration, RLS policies, dan Midtrans sandbox credentials terverifikasi.
