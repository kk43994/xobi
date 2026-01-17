import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Divider, Form, Input, InputNumber, Modal, Radio, Select, Space, Switch, Tabs, Tag, Typography, message } from 'antd';
import { useWorkbenchToolbarSlots } from '@/layout/workbenchToolbar';
import { usePortalUiStore } from '@/store/usePortalUiStore';
import type { Settings } from '@/types';
import {
  OUTPUT_LANGUAGE_OPTIONS,
  getModuleSettings,
  getSettings,
  resetSettings,
  testConnection,
  testMineruConnection,
  testModuleMineruConnection,
  testModuleSettingsConnection,
  testModuleVideoMultimodalConnection,
  testModuleYunwuVideoConnection,
  testVideoMultimodalConnection,
  testYunwuVideoConnection,
  updateModuleSettings,
  updateSettings,
  videoWorkstationSyncSettings,
  type OutputLanguage,
} from '@/api/endpoints';

type ConnStatus = 'unknown' | 'ok' | 'fail';
type ConnState = { ai: ConnStatus; mineru: ConnStatus; yunwu: ConnStatus; multimodal: ConnStatus };

type ModuleKey =
  | 'main_factory'
  | 'detail_factory'
  | 'batch_factory'
  | 'excel'
  | 'editor'
  | 'video_factory'
  | 'agent';

const RESOLUTION_OPTIONS = [
  { value: '1K', label: '1K (1024px)' },
  { value: '2K', label: '2K (2048px)' },
  { value: '4K', label: '4K (4096px)' },
];

const MODULES: Array<{ key: ModuleKey; label: string }> = [
  { key: 'main_factory', label: '主图工厂' },
  { key: 'detail_factory', label: '详情图工厂' },
  { key: 'batch_factory', label: '批量工厂' },
  { key: 'excel', label: 'Excel 工作台' },
  { key: 'editor', label: '编辑器' },
  { key: 'video_factory', label: '视频工厂' },
  { key: 'agent', label: 'Agent' },
];

const statusTag = (s: ConnStatus, label: string) => {
  if (s === 'ok') return <Tag color="green">{label}：OK</Tag>;
  if (s === 'fail') return <Tag color="red">{label}：失败</Tag>;
  return <Tag>{label}：未测</Tag>;
};

export function PortalSettingsPage() {
  const theme = usePortalUiStore((s) => s.theme);
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<'global' | 'module'>('global');
  const [advancedMode, setAdvancedMode] = useState(() => {
    try {
      return localStorage.getItem('xobi_settings_advanced') === '1';
    } catch {
      return false;
    }
  });

  const [globalForm] = Form.useForm();
  const [moduleForm] = Form.useForm();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [globalConn, setGlobalConn] = useState<ConnState>({ ai: 'unknown', mineru: 'unknown', yunwu: 'unknown', multimodal: 'unknown' });

  const [moduleKey, setModuleKey] = useState<ModuleKey>('main_factory');
  const [moduleLoading, setModuleLoading] = useState(false);
  const [moduleSaving, setModuleSaving] = useState(false);
  const [moduleOverrides, setModuleOverrides] = useState<any>(null);
  const [moduleEffective, setModuleEffective] = useState<any>(null);
  const [moduleConn, setModuleConn] = useState<ConnState>({ ai: 'unknown', mineru: 'unknown', yunwu: 'unknown', multimodal: 'unknown' });

  const panelBorder = theme === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid #f0f0f0';
  const panelBg = theme === 'dark' ? '#0f1115' : '#ffffff';
  const panelAltBg = theme === 'dark' ? '#0b0d10' : '#fafbff';
  const textSecondary = theme === 'dark' ? 'rgba(255,255,255,0.45)' : undefined;

  const apiKeyPlaceholder = useMemo(() => {
    const len = settings?.api_key_length || 0;
    return len > 0 ? `已设置（长度：${len}）` : '输入 API Key（留空则保持不变）';
  }, [settings?.api_key_length]);

  const mineruTokenPlaceholder = useMemo(() => {
    const len = settings?.mineru_token_length || 0;
    return len > 0 ? `已设置（长度：${len}）` : '输入 MinerU Token（留空则保持不变）';
  }, [settings?.mineru_token_length]);

  const yunwuKeyPlaceholder = useMemo(() => {
    const len = settings?.yunwu_api_key_length || 0;
    const mainLen = settings?.api_key_length || 0;
    if (len > 0) return `已设置（长度：${len}）`;
    if (mainLen > 0) return `未单独设置（将复用主 API Key，长度：${mainLen}）`;
    return '可选：留空则复用主 API Key（未保存时请先填主 Key）';
  }, [settings?.yunwu_api_key_length, settings?.api_key_length]);

  const multimodalKeyPlaceholder = useMemo(() => {
    const len = settings?.video_multimodal_api_key_length || 0;
    return len > 0 ? `已设置（长度：${len}）` : '输入多模态 API Key（留空则保持不变）';
  }, [settings?.video_multimodal_api_key_length]);

  const moduleApiKeyPlaceholder = useMemo(() => {
    const overrideLen = Number(moduleOverrides?.api_key_length || 0);
    const effectiveLen = Number(moduleEffective?.api_key_length || 0);
    if (overrideLen > 0) return `已覆盖（长度：${overrideLen}）`;
    if (effectiveLen > 0) return `继承全局（长度：${effectiveLen}）`;
    return '未设置（输入后保存）';
  }, [moduleOverrides?.api_key_length, moduleEffective?.api_key_length]);

  const moduleMineruTokenPlaceholder = useMemo(() => {
    const overrideLen = Number(moduleOverrides?.mineru_token_length || 0);
    const effectiveLen = Number(moduleEffective?.mineru_token_length || 0);
    if (overrideLen > 0) return `已覆盖（长度：${overrideLen}）`;
    if (effectiveLen > 0) return `继承全局（长度：${effectiveLen}）`;
    return '未设置（输入后保存）';
  }, [moduleOverrides?.mineru_token_length, moduleEffective?.mineru_token_length]);

  const moduleYunwuKeyPlaceholder = useMemo(() => {
    const overrideLen = Number(moduleOverrides?.yunwu_api_key_length || 0);
    const effectiveLen = Number(moduleEffective?.yunwu_api_key_length || 0);
    const effectiveMainLen = Number(moduleEffective?.api_key_length || 0);
    if (overrideLen > 0) return `已覆盖（长度：${overrideLen}）`;
    if (effectiveLen > 0) return `继承全局（长度：${effectiveLen}）`;
    if (effectiveMainLen > 0) return `未单独设置（将复用主 API Key，长度：${effectiveMainLen}）`;
    return '可选：留空则复用主 API Key（未保存时请先填主 Key）';
  }, [moduleOverrides?.yunwu_api_key_length, moduleEffective?.yunwu_api_key_length, moduleEffective?.api_key_length]);

  const moduleMultimodalKeyPlaceholder = useMemo(() => {
    const overrideLen = Number(moduleOverrides?.video_multimodal_api_key_length || 0);
    const effectiveLen = Number(moduleEffective?.video_multimodal_api_key_length || 0);
    if (overrideLen > 0) return `已覆盖（长度：${overrideLen}）`;
    if (effectiveLen > 0) return `继承全局（长度：${effectiveLen}）`;
    return '未设置（输入后保存）';
  }, [moduleOverrides?.video_multimodal_api_key_length, moduleEffective?.video_multimodal_api_key_length]);

  const loadGlobal = async () => {
    setLoading(true);
    try {
      const res = await getSettings();
      const s = res.data || null;
      setSettings(s);
      if (s) {
        globalForm.setFieldsValue({
          ai_provider_format: (s.ai_provider_format as any) || 'gemini',
          api_base_url: s.api_base_url || '',
          api_key: '',
          text_model: s.text_model || '',
          image_model: s.image_model || '',
          image_caption_model: s.image_caption_model || '',
          mineru_api_base: s.mineru_api_base || '',
          mineru_token: '',
          image_resolution: s.image_resolution || '2K',
          max_description_workers: s.max_description_workers || 5,
          max_image_workers: s.max_image_workers || 8,
          output_language: (s.output_language as OutputLanguage) || 'zh',
          yunwu_api_base: s.yunwu_api_base || 'https://api.kk666.online',
          yunwu_api_key: '',
          yunwu_video_model: s.yunwu_video_model || 'sora-2-pro',
          video_multimodal_api_base: s.video_multimodal_api_base || 'https://api.kk666.online/v1',
          video_multimodal_api_key: '',
          video_multimodal_model: s.video_multimodal_model || 'gpt-4o',
          video_multimodal_enabled: s.video_multimodal_enabled ?? true,
        });
      }
    } catch (e: any) {
      message.error(e?.message || '加载设置失败');
      setSettings(null);
    } finally {
      setLoading(false);
    }
  };

  const loadModule = async (mk: ModuleKey) => {
    setModuleLoading(true);
    try {
      const res = await getModuleSettings(mk);
      const overrides = res.data?.overrides || null;
      const effective = res.data?.effective || null;
      setModuleOverrides(overrides);
      setModuleEffective(effective);
      moduleForm.setFieldsValue({
        module_key: mk,
        ai_provider_format: (overrides?.ai_provider_format as any) || '',
        api_base_url: overrides?.api_base_url || '',
        api_key: '',
        text_model: overrides?.text_model || '',
        image_model: overrides?.image_model || '',
        image_caption_model: overrides?.image_caption_model || '',
        mineru_api_base: overrides?.mineru_api_base || '',
        mineru_token: '',
        yunwu_api_base: overrides?.yunwu_api_base || '',
        yunwu_api_key: '',
        yunwu_video_model: overrides?.yunwu_video_model || '',
        video_multimodal_api_base: overrides?.video_multimodal_api_base || '',
        video_multimodal_api_key: '',
        video_multimodal_model: overrides?.video_multimodal_model || '',
        video_multimodal_enabled:
          overrides?.video_multimodal_enabled === null || overrides?.video_multimodal_enabled === undefined
            ? 'inherit'
            : Boolean(overrides.video_multimodal_enabled),
      });
    } catch (e: any) {
      message.error(e?.message || '加载模块设置失败');
      setModuleOverrides(null);
      setModuleEffective(null);
    } finally {
      setModuleLoading(false);
    }
  };

  useEffect(() => {
    loadGlobal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moduleFromQuery = useMemo(() => (searchParams.get('module') || '').trim(), [searchParams]);

  useEffect(() => {
    if (!moduleFromQuery) return;
    if (!MODULES.some((m) => m.key === (moduleFromQuery as any))) return;

    setAdvancedMode(true);
    try {
      localStorage.setItem('xobi_settings_advanced', '1');
    } catch {}
    setTab('module');
    setModuleKey((prev) => (prev === (moduleFromQuery as any) ? prev : (moduleFromQuery as ModuleKey)));
  }, [moduleFromQuery]);

  useEffect(() => {
    loadModule(moduleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleKey]);

  const onResetGlobal = () => {
    Modal.confirm({
      title: '确认重置为默认配置？',
      content: '将把大模型、图像生成、并发与解析等所有配置恢复为默认值。',
      okText: '确定重置',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        if (saving) return;
        setSaving(true);
        try {
          await resetSettings();
          message.success('已重置为默认配置');
          await loadGlobal();
        } catch (e: any) {
          message.error(e?.message || '重置失败');
        } finally {
          setSaving(false);
        }
      },
    });
  };

  const onSyncVideoWorkstation = async () => {
    try {
      const res = await videoWorkstationSyncSettings({ module_key: 'video_factory' });
      message.success(res.message || '已同步到视频工厂');
    } catch (e: any) {
      message.error(e?.response?.data?.error?.message || e?.message || '同步失败（请确认视频工厂服务已启动）');
    }
  };

  const onSaveGlobal = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const values = await globalForm.validateFields();
      const captionModel = advancedMode ? values.image_caption_model || '' : values.text_model || '';
      const payload: any = {
        ai_provider_format: values.ai_provider_format,
        api_base_url: values.api_base_url || '',
        text_model: values.text_model || '',
        image_model: values.image_model || '',
        image_caption_model: captionModel,
        mineru_api_base: values.mineru_api_base || '',
        image_resolution: values.image_resolution || '2K',
        max_description_workers: values.max_description_workers,
        max_image_workers: values.max_image_workers,
        output_language: values.output_language,
        yunwu_api_base: values.yunwu_api_base || '',
        yunwu_video_model: values.yunwu_video_model || '',
        video_multimodal_api_base: values.video_multimodal_api_base || '',
        video_multimodal_model: values.video_multimodal_model || '',
        video_multimodal_enabled: values.video_multimodal_enabled,
      };
      if (values.api_key) payload.api_key = values.api_key;
      if (values.mineru_token) payload.mineru_token = values.mineru_token;
      if (values.yunwu_api_key) payload.yunwu_api_key = values.yunwu_api_key;
      if (values.video_multimodal_api_key) payload.video_multimodal_api_key = values.video_multimodal_api_key;

      if (!advancedMode) {
        // 简单模式：默认用同一个“多模态模型/Key”服务 Agent/识图/聊天/分析，同时作为视频多模态的兜底配置
        payload.video_multimodal_api_base = payload.api_base_url;
        payload.video_multimodal_model = payload.text_model;
        payload.video_multimodal_enabled = true;
        if (values.api_key) payload.video_multimodal_api_key = values.api_key;
      }

      const res = await updateSettings(payload);
      setSettings(res.data || null);
      globalForm.setFieldsValue({ api_key: '', mineru_token: '', yunwu_api_key: '', video_multimodal_api_key: '' });
      message.success('全局设置已保存');
    } catch (e: any) {
      message.error(e?.response?.data?.error?.message || e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const onSaveModule = async () => {
    if (moduleSaving) return;
    setModuleSaving(true);
    try {
      const values = await moduleForm.validateFields();
      const payload: any = {
        ai_provider_format: values.ai_provider_format || '',
        api_base_url: values.api_base_url || '',
        text_model: values.text_model || '',
        image_model: values.image_model || '',
        image_caption_model: values.image_caption_model || '',
        mineru_api_base: values.mineru_api_base || '',
        yunwu_api_base: values.yunwu_api_base || '',
        yunwu_video_model: values.yunwu_video_model || '',
        video_multimodal_api_base: values.video_multimodal_api_base || '',
        video_multimodal_model: values.video_multimodal_model || '',
        video_multimodal_enabled: values.video_multimodal_enabled === 'inherit' ? null : Boolean(values.video_multimodal_enabled),
      };
      if (values.api_key) payload.api_key = values.api_key;
      if (values.mineru_token) payload.mineru_token = values.mineru_token;
      if (values.yunwu_api_key) payload.yunwu_api_key = values.yunwu_api_key;
      if (values.video_multimodal_api_key) payload.video_multimodal_api_key = values.video_multimodal_api_key;

      const res = await updateModuleSettings(moduleKey, payload);
      setModuleOverrides(res.data?.overrides || null);
      setModuleEffective(res.data?.effective || null);
      moduleForm.setFieldsValue({ api_key: '', mineru_token: '', yunwu_api_key: '', video_multimodal_api_key: '' });
      message.success('模块设置已保存');
    } catch (e: any) {
      message.error(e?.response?.data?.error?.message || e?.message || '保存失败');
    } finally {
      setModuleSaving(false);
    }
  };

  const clearModuleSecret = async (field: 'api_key' | 'mineru_token' | 'yunwu_api_key' | 'video_multimodal_api_key') => {
    const label =
      field === 'api_key'
        ? 'API Key'
        : field === 'mineru_token'
          ? 'MinerU Token'
          : field === 'yunwu_api_key'
            ? '酷可 API Key'
            : '多模态 API Key';

    const hasOverride =
      field === 'api_key'
        ? Number(moduleOverrides?.api_key_length || 0) > 0
        : field === 'mineru_token'
          ? Number(moduleOverrides?.mineru_token_length || 0) > 0
          : field === 'yunwu_api_key'
            ? Number(moduleOverrides?.yunwu_api_key_length || 0) > 0
            : Number(moduleOverrides?.video_multimodal_api_key_length || 0) > 0;
    if (!hasOverride) return;

    Modal.confirm({
      title: `确认清除该模块的 ${label} 覆盖？`,
      content: '清除后将恢复为继承全局（或系统默认）。',
      okText: '清除覆盖',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await updateModuleSettings(moduleKey, { [field]: null } as any);
          message.success('已清除覆盖');
          await loadModule(moduleKey);
        } catch (e: any) {
          message.error(e?.response?.data?.error?.message || e?.message || '清除失败');
        }
      },
    });
  };

  const testGlobalAi = async () => {
    try {
      const values = globalForm.getFieldsValue();
      const hasSavedKey = (settings?.api_key_length || 0) > 0;
      if (!values.api_key && !hasSavedKey) return message.error('请先输入 API Key');
      const res = await testConnection({
        ai_provider_format: values.ai_provider_format,
        api_base_url: values.api_base_url || undefined,
        api_key: values.api_key || 'use-saved-key',
        text_model: values.text_model || undefined,
      });
      setGlobalConn((p) => ({ ...p, ai: 'ok' }));
      message.success(res.data?.message ? String(res.data.message) : '连接成功');
    } catch (e: any) {
      setGlobalConn((p) => ({ ...p, ai: 'fail' }));
      message.error(e?.response?.data?.error?.message || e?.message || '连接失败');
    }
  };

  const testGlobalMineru = async () => {
    try {
      const values = globalForm.getFieldsValue();
      const hasSavedToken = (settings?.mineru_token_length || 0) > 0;
      if (!values.mineru_token && !hasSavedToken) return message.error('请先输入 MinerU Token');
      const res = await testMineruConnection({
        mineru_api_base: values.mineru_api_base || undefined,
        mineru_token: values.mineru_token || 'use-saved-key',
      });
      setGlobalConn((p) => ({ ...p, mineru: 'ok' }));
      message.success(res.data?.message ? String(res.data.message) : 'MinerU 连接成功');
    } catch (e: any) {
      setGlobalConn((p) => ({ ...p, mineru: 'fail' }));
      message.error(e?.response?.data?.error?.message || e?.message || 'MinerU 连接失败');
    }
  };

  const testGlobalYunwu = async () => {
    try {
      const values = globalForm.getFieldsValue();
      const hasSavedKey = (settings?.yunwu_api_key_length || 0) > 0;
      const hasSavedMain = (settings?.api_key_length || 0) > 0;
      if (!values.yunwu_api_key && !hasSavedKey && !values.api_key && !hasSavedMain) {
        return message.error('请先输入主 API Key（或酷可 API Key）');
      }
      const res = await testYunwuVideoConnection({
        yunwu_api_base: values.yunwu_api_base || undefined,
        yunwu_api_key: values.yunwu_api_key || values.api_key || 'use-saved-key',
      });
      setGlobalConn((p) => ({ ...p, yunwu: 'ok' }));
      message.success(res.data?.message ? String(res.data.message) : '酷可视频连接成功');
    } catch (e: any) {
      setGlobalConn((p) => ({ ...p, yunwu: 'fail' }));
      message.error(e?.response?.data?.error?.message || e?.message || '酷可视频连接失败');
    }
  };

  const testGlobalMultimodal = async () => {
    try {
      const values = globalForm.getFieldsValue();
      const hasSavedKey = (settings?.video_multimodal_api_key_length || 0) > 0;
      if (!values.video_multimodal_api_key && !hasSavedKey) return message.error('请先输入多模态 API Key');
      const res = await testVideoMultimodalConnection({
        video_multimodal_api_base: values.video_multimodal_api_base || undefined,
        video_multimodal_api_key: values.video_multimodal_api_key || 'use-saved-key',
        video_multimodal_model: values.video_multimodal_model || undefined,
      });
      setGlobalConn((p) => ({ ...p, multimodal: 'ok' }));
      message.success(res.data?.message ? String(res.data.message) : '多模态连接成功');
    } catch (e: any) {
      setGlobalConn((p) => ({ ...p, multimodal: 'fail' }));
      message.error(e?.response?.data?.error?.message || e?.message || '多模态连接失败');
    }
  };

  const testModuleAi = async () => {
    try {
      const values = moduleForm.getFieldsValue();
      const effectiveLen = Number(moduleEffective?.api_key_length || 0);
      if (!values.api_key && effectiveLen <= 0) return message.error('请先输入 API Key（模块未继承到任何 Key）');
      const res = await testModuleSettingsConnection(moduleKey, {
        ai_provider_format: values.ai_provider_format || undefined,
        api_base_url: values.api_base_url || undefined,
        api_key: values.api_key || 'use-saved-key',
        text_model: values.text_model || undefined,
      });
      setModuleConn((p) => ({ ...p, ai: 'ok' }));
      message.success(res.data?.message ? String(res.data.message) : '连接成功');
    } catch (e: any) {
      setModuleConn((p) => ({ ...p, ai: 'fail' }));
      message.error(e?.response?.data?.error?.message || e?.message || '连接失败');
    }
  };

  const testModuleMineru = async () => {
    try {
      const values = moduleForm.getFieldsValue();
      const effectiveLen = Number(moduleEffective?.mineru_token_length || 0);
      if (!values.mineru_token && effectiveLen <= 0) return message.error('请先输入 MinerU Token（模块未继承到任何 Token）');
      const res = await testModuleMineruConnection(moduleKey, {
        mineru_api_base: values.mineru_api_base || undefined,
        mineru_token: values.mineru_token || 'use-saved-key',
      });
      setModuleConn((p) => ({ ...p, mineru: 'ok' }));
      message.success(res.data?.message ? String(res.data.message) : 'MinerU 连接成功');
    } catch (e: any) {
      setModuleConn((p) => ({ ...p, mineru: 'fail' }));
      message.error(e?.response?.data?.error?.message || e?.message || 'MinerU 连接失败');
    }
  };

  const testModuleYunwu = async () => {
    try {
      const values = moduleForm.getFieldsValue();
      const effectiveLen = Number(moduleEffective?.yunwu_api_key_length || 0);
      const effectiveMainLen = Number(moduleEffective?.api_key_length || 0);
      if (!values.yunwu_api_key && effectiveLen <= 0 && !values.api_key && effectiveMainLen <= 0) {
        return message.error('请先输入主 API Key（或酷可 API Key）');
      }
      const res = await testModuleYunwuVideoConnection(moduleKey, {
        yunwu_api_base: values.yunwu_api_base || undefined,
        yunwu_api_key: values.yunwu_api_key || values.api_key || 'use-saved-key',
      });
      setModuleConn((p) => ({ ...p, yunwu: 'ok' }));
      message.success(res.data?.message ? String(res.data.message) : '酷可视频连接成功');
    } catch (e: any) {
      setModuleConn((p) => ({ ...p, yunwu: 'fail' }));
      message.error(e?.response?.data?.error?.message || e?.message || '酷可视频连接失败');
    }
  };

  const testModuleMultimodal = async () => {
    try {
      const values = moduleForm.getFieldsValue();
      const effectiveLen = Number(moduleEffective?.video_multimodal_api_key_length || 0);
      if (!values.video_multimodal_api_key && effectiveLen <= 0) return message.error('请先输入多模态 API Key（模块未继承到任何 Key）');
      const res = await testModuleVideoMultimodalConnection(moduleKey, {
        video_multimodal_api_base: values.video_multimodal_api_base || undefined,
        video_multimodal_api_key: values.video_multimodal_api_key || 'use-saved-key',
        video_multimodal_model: values.video_multimodal_model || undefined,
      });
      setModuleConn((p) => ({ ...p, multimodal: 'ok' }));
      message.success(res.data?.message ? String(res.data.message) : '多模态连接成功');
    } catch (e: any) {
      setModuleConn((p) => ({ ...p, multimodal: 'fail' }));
      message.error(e?.response?.data?.error?.message || e?.message || '多模态连接失败');
    }
  };

  useWorkbenchToolbarSlots({
    center: (
      <Space size={8} wrap>
        <Tag color="geekblue">设置</Tag>
        <Tag>{tab === 'global' ? '全局默认' : '按模块'}</Tag>
        <Tag color={advancedMode ? 'gold' : undefined}>{advancedMode ? '高级' : '基础'}</Tag>
      </Space>
    ),
    right: (
      <Space size={8} wrap>
        {tab === 'global' ? (
          <>
            <Button size="small" onClick={onSyncVideoWorkstation} disabled={saving}>
              同步视频工厂
            </Button>
            <Button size="small" onClick={onResetGlobal} disabled={saving}>
              重置
            </Button>
            <Button size="small" type="primary" onClick={onSaveGlobal} loading={saving}>
              保存
            </Button>
          </>
        ) : (
          <>
            <Button size="small" onClick={() => loadModule(moduleKey)} disabled={moduleLoading || moduleSaving}>
              刷新
            </Button>
            <Button size="small" type="primary" onClick={onSaveModule} loading={moduleSaving}>
              保存
            </Button>
          </>
        )}
      </Space>
    ),
  }, [tab, advancedMode, saving, moduleLoading, moduleSaving]);

  return (
    <div style={{ padding: 12, height: '100%', overflow: 'auto' }}>
      <div style={{ border: panelBorder, background: panelBg, borderRadius: 14, padding: 14 }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
              <Space direction="vertical" size={0}>
                <Typography.Text strong style={{ fontSize: 16 }}>
                  API 配置中心
                </Typography.Text>
                <Typography.Text type="secondary" style={{ color: textSecondary }}>
                  基础模式只需要 3 项：多模态（Agent/识图/聊天/分析）/ 生图 / 视频（酷可）。其它都放到高级里。
                </Typography.Text>
              </Space>
              <Space>
                <Typography.Text type="secondary" style={{ color: textSecondary }}>
                  高级
                </Typography.Text>
                <Switch
                  checked={advancedMode}
                  onChange={(v) => {
                    setAdvancedMode(v);
                    try {
                      localStorage.setItem('xobi_settings_advanced', v ? '1' : '0');
                    } catch {}
                    if (!v) setTab('global');
                  }}
                />
              </Space>
            </Space>
          </Space>
          <Divider style={{ margin: '8px 0' }} />
          <Tabs
            activeKey={tab}
            onChange={(k) => setTab(k as any)}
            items={[
              {
                key: 'global',
                label: '全局默认',
                children: (
                  <Form form={globalForm} layout="vertical" disabled={loading}>
                    <Space direction="vertical" size="large" style={{ width: '100%' }}>
                      <div style={{ border: panelBorder, borderRadius: 14, padding: 12, background: panelAltBg }}>
                        <Space direction="vertical" size={8} style={{ width: '100%' }}>
                          <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
                            <Typography.Text strong>连通性测试（全局）</Typography.Text>
                            <Space wrap>
                              {statusTag(globalConn.ai, 'AI')}
                              {advancedMode ? statusTag(globalConn.mineru, 'MinerU') : null}
                              {statusTag(globalConn.yunwu, '酷可视频')}
                              {advancedMode ? statusTag(globalConn.multimodal, '多模态') : null}
                            </Space>
                          </Space>
                          <Space wrap>
                            <Button onClick={testGlobalAi}>测试 AI</Button>
                            <Button onClick={testGlobalYunwu}>测试酷可视频</Button>
                            {advancedMode ? <Button onClick={testGlobalMineru}>测试 MinerU</Button> : null}
                            {advancedMode ? <Button onClick={testGlobalMultimodal}>测试多模态</Button> : null}
                          </Space>
                          <Typography.Text type="secondary" style={{ color: textSecondary, fontSize: 12 }}>
                            Key/Token 留空时会使用"已保存的 Key/Token"进行测试；酷可 Key 留空会自动复用主 API Key。
                          </Typography.Text>
                        </Space>
                      </div>

                      <div>
                        <Typography.Text strong>AI 配置</Typography.Text>
                        <Divider style={{ margin: '8px 0' }} />
                        <Form.Item name="ai_provider_format" label="AI 提供商格式" required>
                          <Radio.Group
                            optionType="button"
                            buttonStyle="solid"
                            options={[
                              { label: 'OpenAI 格式', value: 'openai' },
                              { label: 'Gemini 格式', value: 'gemini' },
                            ]}
                          />
                        </Form.Item>
                        <Form.Item name="api_base_url" label="API Base URL" tooltip="OpenAI 格式通常需要以 /v1 结尾（如 https://api.kk666.online/v1）">
                          <Input placeholder="https://api.kk666.online/v1" />
                        </Form.Item>
                        <Form.Item name="api_key" label="API Key">
                          <Input.Password placeholder={apiKeyPlaceholder} />
                        </Form.Item>
                      </div>

                      <div>
                        <Typography.Text strong>模型配置</Typography.Text>
                        <Divider style={{ margin: '8px 0' }} />
                        <Form.Item name="text_model" label="多模态模型（Agent/识图/聊天/分析）">
                          <Input placeholder="如：gpt-4o / gpt-4o-mini / gemini-3-flash-preview" />
                        </Form.Item>
                        <Form.Item name="image_model" label="生图模型（主图/详情图）">
                          <Input placeholder="如：gemini-3-pro-image-preview" />
                        </Form.Item>
                        {advancedMode ? (
                          <Form.Item name="image_caption_model" label="图片分析模型（高级，可与多模态分开）">
                            <Input placeholder="留空则默认复用多模态模型" />
                          </Form.Item>
                        ) : null}
                      </div>

                      {advancedMode ? (
                        <div>
                          <Typography.Text strong>MinerU</Typography.Text>
                          <Divider style={{ margin: '8px 0' }} />
                          <Form.Item name="mineru_api_base" label="MinerU API Base">
                            <Input placeholder="https://mineru.net" />
                          </Form.Item>
                          <Form.Item name="mineru_token" label="MinerU Token">
                            <Input.Password placeholder={mineruTokenPlaceholder} />
                          </Form.Item>
                        </div>
                      ) : null}

                      {advancedMode ? (
                        <div>
                          <Typography.Text strong>图像/并发/语言</Typography.Text>
                          <Divider style={{ margin: '8px 0' }} />
                          <Form.Item name="image_resolution" label="图像清晰度">
                            <Select options={RESOLUTION_OPTIONS} style={{ maxWidth: 320 }} />
                          </Form.Item>
                          <Space wrap>
                            <Form.Item name="max_description_workers" label="文本并发" style={{ marginBottom: 0 }}>
                              <InputNumber min={1} max={20} style={{ width: 180 }} />
                            </Form.Item>
                            <Form.Item name="max_image_workers" label="图片并发" style={{ marginBottom: 0 }}>
                              <InputNumber min={1} max={20} style={{ width: 180 }} />
                            </Form.Item>
                          </Space>
                          <Form.Item name="output_language" label="默认输出语言">
                            <Radio.Group
                              optionType="button"
                              buttonStyle="solid"
                              options={OUTPUT_LANGUAGE_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
                            />
                          </Form.Item>
                        </div>
                      ) : null}

                      <div>
                        <Typography.Text strong>视频模型（酷可）</Typography.Text>
                        <Divider style={{ margin: '8px 0' }} />
                        <Form.Item name="yunwu_api_base" label="酷可 API Base URL">
                          <Input placeholder="https://api.kk666.online" />
                        </Form.Item>
                        <Form.Item name="yunwu_api_key" label="酷可 API Key">
                          <Input.Password placeholder={yunwuKeyPlaceholder} />
                        </Form.Item>
                        <Form.Item name="yunwu_video_model" label="视频模型">
                          <Input placeholder="sora-2-pro" />
                        </Form.Item>

                        {advancedMode ? (
                          <>
                            <Divider style={{ margin: '12px 0' }} />
                            <Typography.Text strong>视频多模态（高级）</Typography.Text>
                            <Divider style={{ margin: '8px 0' }} />
                            <Form.Item name="video_multimodal_api_base" label="多模态 API Base URL">
                              <Input placeholder="https://api.kk666.online/v1" />
                            </Form.Item>
                            <Form.Item name="video_multimodal_api_key" label="多模态 API Key">
                              <Input.Password placeholder={multimodalKeyPlaceholder} />
                            </Form.Item>
                            <Form.Item name="video_multimodal_model" label="多模态模型">
                              <Input placeholder="gpt-4o" />
                            </Form.Item>
                            <Form.Item name="video_multimodal_enabled" label="启用AI功能" valuePropName="checked">
                              <Switch checkedChildren="启用" unCheckedChildren="禁用" />
                            </Form.Item>
                          </>
                        ) : null}
                      </div>
                    </Space>
                  </Form>
                ),
              },
              ...(advancedMode
                ? [
                    {
                key: 'module',
                label: '按模块',
                children: (
                  <Space direction="vertical" size="large" style={{ width: '100%' }}>
                    <div style={{ border: panelBorder, borderRadius: 14, padding: 12, background: panelAltBg }}>
                      <Space direction="vertical" size={8} style={{ width: '100%' }}>
                        <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
                          <Space wrap>
                            <Typography.Text strong>选择模块</Typography.Text>
                            <Select
                              value={moduleKey}
                              onChange={(v) => setModuleKey(v)}
                              options={MODULES.map((m) => ({ label: m.label, value: m.key }))}
                              style={{ minWidth: 220 }}
                            />
                          </Space>
                          <Space wrap>
                            {statusTag(moduleConn.ai, 'AI')}
                            {statusTag(moduleConn.mineru, 'MinerU')}
                            {statusTag(moduleConn.yunwu, '酷可视频')}
                            {statusTag(moduleConn.multimodal, '多模态')}
                          </Space>
                        </Space>
                        <Space wrap>
                          <Button onClick={testModuleAi} disabled={moduleLoading}>
                            测试 AI
                          </Button>
                          <Button onClick={testModuleMineru} disabled={moduleLoading}>
                            测试 MinerU
                          </Button>
                          <Button onClick={testModuleYunwu} disabled={moduleLoading}>
                            测试酷可视频
                          </Button>
                          <Button onClick={testModuleMultimodal} disabled={moduleLoading}>
                            测试多模态
                          </Button>
                        </Space>
                        <Typography.Text type="secondary" style={{ color: textSecondary, fontSize: 12 }}>
                          说明：留空=继承全局；Key/Token 留空=不变（如需恢复继承，请点"清除覆盖"）；酷可 Key 留空会自动复用主 API Key。
                        </Typography.Text>
                      </Space>
                    </div>

                    <Form form={moduleForm} layout="vertical" disabled={moduleLoading}>
                      <Space direction="vertical" size="large" style={{ width: '100%' }}>
                        <div>
                          <Typography.Text strong>AI 配置（模块覆盖）</Typography.Text>
                          <Divider style={{ margin: '8px 0' }} />
                          <Form.Item name="ai_provider_format" label="AI 提供商格式">
                            <Radio.Group
                              optionType="button"
                              buttonStyle="solid"
                              options={[
                                { label: '继承全局', value: '' },
                                { label: 'OpenAI 格式', value: 'openai' },
                                { label: 'Gemini 格式', value: 'gemini' },
                              ]}
                            />
                          </Form.Item>
                          <Form.Item name="api_base_url" label="API Base URL（留空继承）" tooltip="OpenAI 格式通常需要以 /v1 结尾（如 https://api.kk666.online/v1）">
                            <Input placeholder={moduleEffective?.api_base_url ? `当前有效：${moduleEffective.api_base_url}` : 'https://api.kk666.online/v1'} />
                          </Form.Item>
                          <Form.Item name="api_key" label="API Key（留空不变）">
                            <Space.Compact style={{ width: '100%' }}>
                              <Input.Password placeholder={moduleApiKeyPlaceholder} />
                              <Button onClick={() => clearModuleSecret('api_key')} disabled={Number(moduleOverrides?.api_key_length || 0) <= 0}>
                                清除覆盖
                              </Button>
                            </Space.Compact>
                          </Form.Item>
                        </div>

                        <div>
                          <Typography.Text strong>模型配置（模块覆盖）</Typography.Text>
                          <Divider style={{ margin: '8px 0' }} />
                          <Form.Item name="text_model" label="文本模型（标题/文案/Agent）">
                            <Input placeholder={moduleEffective?.text_model ? `当前有效：${moduleEffective.text_model}` : '如：gemini-3-flash-preview / gpt-4o-mini'} />
                          </Form.Item>
                          <Form.Item name="image_model" label="生图模型（主图/详情图）">
                            <Input placeholder={moduleEffective?.image_model ? `当前有效：${moduleEffective.image_model}` : '如：gemini-3-pro-image-preview'} />
                          </Form.Item>
                          <Form.Item name="image_caption_model" label="图片分析模型（图像理解/识别）">
                            <Input
                              placeholder={
                                moduleEffective?.image_caption_model ? `当前有效：${moduleEffective.image_caption_model}` : '如：gemini-3-flash-preview / gpt-4o-mini'
                              }
                            />
                          </Form.Item>
                        </div>

                        <div>
                          <Typography.Text strong>MinerU（模块覆盖）</Typography.Text>
                          <Divider style={{ margin: '8px 0' }} />
                          <Form.Item name="mineru_api_base" label="MinerU API Base（留空继承）">
                            <Input placeholder={moduleEffective?.mineru_api_base ? `当前有效：${moduleEffective.mineru_api_base}` : 'https://mineru.net'} />
                          </Form.Item>
                          <Form.Item name="mineru_token" label="MinerU Token（留空不变）">
                            <Space.Compact style={{ width: '100%' }}>
                              <Input.Password placeholder={moduleMineruTokenPlaceholder} />
                              <Button onClick={() => clearModuleSecret('mineru_token')} disabled={Number(moduleOverrides?.mineru_token_length || 0) <= 0}>
                                清除覆盖
                              </Button>
                            </Space.Compact>
                          </Form.Item>
                        </div>

                        <div>
                          <Typography.Text strong>视频（模块覆盖）</Typography.Text>
                          <Divider style={{ margin: '8px 0' }} />
                          <Form.Item name="yunwu_api_base" label="酷可 API Base URL（留空继承）">
                            <Input placeholder={moduleEffective?.yunwu_api_base ? `当前有效：${moduleEffective.yunwu_api_base}` : 'https://api.kk666.online'} />
                          </Form.Item>
                          <Form.Item name="yunwu_api_key" label="酷可 API Key（留空不变）">
                            <Space.Compact style={{ width: '100%' }}>
                              <Input.Password placeholder={moduleYunwuKeyPlaceholder} />
                              <Button onClick={() => clearModuleSecret('yunwu_api_key')} disabled={Number(moduleOverrides?.yunwu_api_key_length || 0) <= 0}>
                                清除覆盖
                              </Button>
                            </Space.Compact>
                          </Form.Item>
                          <Form.Item name="yunwu_video_model" label="酷可视频模型（留空继承）">
                            <Input placeholder={moduleEffective?.yunwu_video_model ? `当前有效：${moduleEffective.yunwu_video_model}` : 'sora-2-pro'} />
                          </Form.Item>

                          <Divider style={{ margin: '12px 0' }} />

                          <Form.Item name="video_multimodal_api_base" label="多模态 API Base URL（留空继承）">
                            <Input
                              placeholder={moduleEffective?.video_multimodal_api_base ? `当前有效：${moduleEffective.video_multimodal_api_base}` : 'https://api.kk666.online/v1'}
                            />
                          </Form.Item>
                          <Form.Item name="video_multimodal_api_key" label="多模态 API Key（留空不变）">
                            <Space.Compact style={{ width: '100%' }}>
                              <Input.Password placeholder={moduleMultimodalKeyPlaceholder} />
                              <Button
                                onClick={() => clearModuleSecret('video_multimodal_api_key')}
                                disabled={Number(moduleOverrides?.video_multimodal_api_key_length || 0) <= 0}
                              >
                                清除覆盖
                              </Button>
                            </Space.Compact>
                          </Form.Item>
                          <Form.Item name="video_multimodal_model" label="多模态模型（留空继承）">
                            <Input placeholder={moduleEffective?.video_multimodal_model ? `当前有效：${moduleEffective.video_multimodal_model}` : 'gpt-4o'} />
                          </Form.Item>
                          <Form.Item name="video_multimodal_enabled" label="启用AI功能（留空继承）">
                            <Radio.Group
                              optionType="button"
                              buttonStyle="solid"
                              options={[
                                { label: '继承全局', value: 'inherit' },
                                { label: '启用', value: true },
                                { label: '禁用', value: false },
                              ]}
                            />
                          </Form.Item>
                        </div>

                        <div style={{ border: panelBorder, borderRadius: 14, padding: 12, background: panelAltBg }}>
                          <Typography.Text strong>当前有效配置（含继承）</Typography.Text>
                          <Divider style={{ margin: '8px 0' }} />
                          <Space direction="vertical" size={2} style={{ width: '100%' }}>
                            <Typography.Text type="secondary" style={{ color: textSecondary }}>
                              AI：{String(moduleEffective?.ai_provider_format || '')} / {String(moduleEffective?.api_base_url || '')}
                            </Typography.Text>
                            <Typography.Text type="secondary" style={{ color: textSecondary }}>
                              文本模型：{String(moduleEffective?.text_model || '')}
                            </Typography.Text>
                            <Typography.Text type="secondary" style={{ color: textSecondary }}>
                              生图模型：{String(moduleEffective?.image_model || '')}
                            </Typography.Text>
                            <Typography.Text type="secondary" style={{ color: textSecondary }}>
                              图片分析：{String(moduleEffective?.image_caption_model || '')}
                            </Typography.Text>
                            <Typography.Text type="secondary" style={{ color: textSecondary }}>
                              MinerU：{String(moduleEffective?.mineru_api_base || '')}（Token 长度：{Number(moduleEffective?.mineru_token_length || 0)}）
                            </Typography.Text>
                            <Typography.Text type="secondary" style={{ color: textSecondary }}>
                              酷可：{String(moduleEffective?.yunwu_api_base || '')} / {String(moduleEffective?.yunwu_video_model || '')}（Key 长度：{Number(moduleEffective?.yunwu_api_key_length || 0)}）
                            </Typography.Text>
                            <Typography.Text type="secondary" style={{ color: textSecondary }}>
                              多模态：{String(moduleEffective?.video_multimodal_api_base || '')} / {String(moduleEffective?.video_multimodal_model || '')}（Key 长度：
                              {Number(moduleEffective?.video_multimodal_api_key_length || 0)}，启用：{String(moduleEffective?.video_multimodal_enabled)})
                            </Typography.Text>
                            <Typography.Text type="secondary" style={{ color: textSecondary }}>
                              AI Key 长度：{Number(moduleEffective?.api_key_length || 0)}
                            </Typography.Text>
                          </Space>
                        </div>
                      </Space>
                    </Form>
                  </Space>
                ),
                    },
                  ]
                : []),
            ]}
          />
          {/* 避免 antd Form 在“按模块”Tab 未挂载时提示 moduleForm 未连接 */}
          {tab !== 'module' ? <Form form={moduleForm} style={{ display: 'none' }} /> : null}
        </Space>
      </div>
    </div>
  );
}
