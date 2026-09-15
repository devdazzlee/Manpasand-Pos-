import { Router } from 'express';
import {
  getAlfalahConfig,
  getAlfalahSsoForm,
  verifyAlfalahPayment,
  handleAlfalahIpn,
} from '../controllers/alfalah.controller';

const router = Router();

router.get('/config', getAlfalahConfig);
router.get('/sso', getAlfalahSsoForm);
router.post('/sso', getAlfalahSsoForm);
router.get('/verify', verifyAlfalahPayment);
router.post('/verify', verifyAlfalahPayment);
router.get('/ipn', handleAlfalahIpn);
router.post('/ipn', handleAlfalahIpn);

export default router;
