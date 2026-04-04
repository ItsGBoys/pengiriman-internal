-- Jalankan di Supabase SQL Editor (atau supabase db push) sebelum memakai form input staff.
-- Menyatukan insert pengiriman + detail_pengiriman + nomor_seri dalam satu transaksi.

ALTER TABLE public.pengiriman ADD COLUMN IF NOT EXISTS catatan text;

ALTER TABLE public.detail_pengiriman ADD COLUMN IF NOT EXISTS tipe_mesin text;

CREATE TABLE IF NOT EXISTS public.nomor_seri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detail_pengiriman_id uuid NOT NULL REFERENCES public.detail_pengiriman (id) ON DELETE CASCADE,
  nomor_seri text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nomor_seri_detail ON public.nomor_seri (detail_pengiriman_id);

CREATE OR REPLACE FUNCTION public.submit_pengiriman_staff (
  p_toko_tujuan text,
  p_nomor_kendaraan text,
  p_tanggal_pengiriman text,
  p_catatan text,
  p_details jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_pid uuid;
  v_elem jsonb;
  v_detail_id uuid;
  v_sn text;
  v_i int;
  v_n int;
BEGIN
  IF trim(p_toko_tujuan) = '' OR trim(p_nomor_kendaraan) = '' THEN
    RAISE EXCEPTION 'INVALID_INPUT: Toko tujuan dan nomor kendaraan wajib diisi.';
  END IF;

  IF
    p_details IS NULL
    OR jsonb_typeof(p_details) <> 'array'
    OR jsonb_array_length(p_details) = 0
  THEN
    RAISE EXCEPTION 'INVALID_INPUT: Minimal satu tipe barang.';
  END IF;

  INSERT INTO public.pengiriman (toko_tujuan, nomor_kendaraan, tanggal_pengiriman, catatan, status)
  VALUES (
    trim(p_toko_tujuan),
    trim(p_nomor_kendaraan),
    p_tanggal_pengiriman::date,
    NULLIF(trim(p_catatan), ''),
    'dalam_perjalanan'
  )
  RETURNING id INTO v_pid;

  FOR v_elem IN
  SELECT
    value
  FROM
    jsonb_array_elements(p_details)
  LOOP
    IF v_elem ->> 'tipe' IS NULL OR trim(v_elem ->> 'tipe') = '' THEN
      RAISE EXCEPTION 'INVALID_INPUT: Setiap baris harus memilih tipe mesin cuci.';
    END IF;

    IF
      jsonb_typeof(v_elem -> 'serials') <> 'array'
      OR jsonb_array_length(v_elem -> 'serials') = 0
    THEN
      RAISE EXCEPTION 'INVALID_INPUT: Setiap tipe minimal memiliki satu nomor seri.';
    END IF;

    INSERT INTO public.detail_pengiriman (pengiriman_id, tipe_mesin, jumlah)
    VALUES (
      v_pid,
      trim(v_elem ->> 'tipe'),
      jsonb_array_length(v_elem -> 'serials')
    )
    RETURNING id INTO v_detail_id;

    v_n := jsonb_array_length(v_elem -> 'serials');

    FOR v_i IN 0..v_n - 1 LOOP
      v_sn := trim(jsonb_extract_path_text(v_elem, 'serials', v_i::text));

      IF v_sn IS NULL OR v_sn = '' THEN
        RAISE EXCEPTION 'INVALID_INPUT: Nomor seri tidak boleh kosong.';
      END IF;

      INSERT INTO public.nomor_seri (detail_pengiriman_id, nomor_seri)
        VALUES (v_detail_id, v_sn);
    END LOOP;
  END LOOP;

  RETURN v_pid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_pengiriman_staff (text, text, text, text, jsonb) TO authenticated;
