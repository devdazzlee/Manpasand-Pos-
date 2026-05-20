import multer from 'multer';

const storage = multer.memoryStorage();

const fileFilter = (req: any, file: any, cb: any) => {
  const ext = (file.originalname || '').toLowerCase();
  const okExt = ext.endsWith('.csv') || ext.endsWith('.xlsx') || ext.endsWith('.xls');
  const okMime =
    !file.mimetype ||
    file.mimetype === 'text/csv' ||
    file.mimetype === 'application/csv' ||
    file.mimetype === 'application/vnd.ms-excel' ||
    file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.mimetype === 'application/octet-stream';

  if (okExt || okMime) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV and Excel files (.csv, .xlsx, .xls) are allowed'), false);
  }
};

const uploadBulk = multer({ storage, fileFilter });

export default uploadBulk;