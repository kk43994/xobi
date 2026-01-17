import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Key, Image, Zap, Save, RotateCcw, Globe, FileText, Wifi, FlaskConical } from 'lucide-react';
import { Button, Input, Card, Loading, useToast, useConfirm } from '@/components/shared';
import * as api from '@/api/endpoints';
import type { OutputLanguage } from '@/api/endpoints';
import { OUTPUT_LANGUAGE_OPTIONS } from '@/api/endpoints';
import type { Settings as SettingsType } from '@/types';
import { usePortalUiStore } from '@/store/usePortalUiStore';

// 配置项类型定义
type FieldType = 'text' | 'password' | 'number' | 'select' | 'buttons';

interface FieldConfig {
  key: keyof typeof initialFormData;
  label: string;
  type: FieldType;
  placeholder?: string;
  description?: string;
  sensitiveField?: boolean;  // 是否为敏感字段（如 API Key）
  lengthKey?: keyof SettingsType;  // 用于显示已有长度的 key（如 api_key_length）
  options?: { value: string; label: string }[];  // select 类型的选项
  min?: number;
  max?: number;
}

interface SectionConfig {
  title: string;
  icon: React.ReactNode;
  fields: FieldConfig[];
}

// 初始表单数据
const initialFormData = {
  ai_provider_format: 'gemini' as 'openai' | 'gemini',
  api_base_url: '',
  api_key: '',
  text_model: '',
  image_model: '',
  image_caption_model: '',
  mineru_api_base: '',
  mineru_token: '',
  image_resolution: '2K',
  image_aspect_ratio: '3:4',
  max_description_workers: 5,
  max_image_workers: 8,
  output_language: 'zh' as OutputLanguage,
};

// 配置驱动的表单区块定义
const settingsSections: SectionConfig[] = [
  {
    title: '大模型 API 配置',
    icon: <Key size={20} />,
    fields: [
      {
        key: 'ai_provider_format',
        label: 'AI 提供商格式',
        type: 'buttons',
        description: '选择 API 请求格式，影响后端如何构造和发送请求。OpenAI 格式：适用于 OpenAI、酷可、AIHubmix 等兼容 OpenAI API 的服务；Gemini 格式：适用于 Google Gemini 官方 API。保存设置后生效。',
        options: [
          { value: 'openai', label: 'OpenAI 格式' },
          { value: 'gemini', label: 'Gemini 格式' },
        ],
      },
      {
        key: 'api_base_url',
        label: 'API Base URL',
        type: 'text',
        placeholder: 'https://api.kk666.online/v1',
        description: '设置大模型提供商 API 的基础 URL。OpenAI 格式示例：https://api.kk666.online/v1（需要以 /v1 结尾）；Gemini 格式示例：https://generativelanguage.googleapis.com。如果使用云雾 AI，填写：https://yunwu.ai/v1',
      },
      {
        key: 'api_key',
        label: 'API Key',
        type: 'password',
        placeholder: '输入新的 API Key（如：sk-xxxxx）',
        sensitiveField: true,
        lengthKey: 'api_key_length',
        description: '从 API 提供商处获取的密钥。留空则保持当前设置不变，输入新值则更新。获取方式：在下方链接注册账号后，进入控制台/API 管理页面创建新的 API Key。',
      },
    ],
  },
  {
    title: '模型配置',
    icon: <FileText size={20} />,
    fields: [
      {
        key: 'text_model',
        label: '文本大模型',
        type: 'text',
        placeholder: '留空使用环境变量配置 (如: gemini-2.0-flash-exp)',
        description: '用于生成大纲、描述等文本内容的模型名称。推荐模型：gemini-2.0-flash-exp（Gemini 格式）、gpt-4o、gpt-4o-mini（OpenAI 格式）。留空则使用后端环境变量中配置的默认模型。',
      },
      {
        key: 'image_model',
        label: '图像生成模型',
        type: 'text',
        placeholder: '如: gemini-2.0-flash-exp-image-generation',
        description: '用于生成商品主图的模型。推荐模型：gemini-2.0-flash-exp-image-generation、imagen-3.0-generate-001（Gemini 格式）、dall-e-3（OpenAI 格式）。如遇 500 错误，请检查模型名称是否正确，或使用下方"测试图片模型"按钮验证。',
      },
      {
        key: 'image_caption_model',
        label: '图片识别模型',
        type: 'text',
        placeholder: '留空使用环境变量配置 (如: gemini-2.0-flash-exp)',
        description: '用于识别参考文件中的图片并生成描述。推荐模型：gemini-2.0-flash-exp（Gemini 格式）、gpt-4o、gpt-4o-mini（OpenAI 格式）。该模型需要支持视觉理解功能。',
      },
    ],
  },
  {
    title: 'MinerU 配置',
    icon: <FileText size={20} />,
    fields: [
      {
        key: 'mineru_api_base',
        label: 'MinerU API Base',
        type: 'text',
        placeholder: '留空使用环境变量配置 (如: https://mineru.net)',
        description: 'MinerU 服务地址，用于解析 PDF、Word 等参考文件。如果您有自己的 MinerU 服务，请填写服务地址；否则留空使用默认配置。',
      },
      {
        key: 'mineru_token',
        label: 'MinerU Token',
        type: 'password',
        placeholder: '输入新的 MinerU Token',
        sensitiveField: true,
        lengthKey: 'mineru_token_length',
        description: 'MinerU 服务的访问令牌。如果您使用的 MinerU 服务需要认证，请填写 Token；否则留空。留空则保持当前设置不变，输入新值则更新。',
      },
    ],
  },
  {
    title: '图像生成配置',
    icon: <Image size={20} />,
    fields: [
      {
        key: 'image_resolution',
        label: '图像清晰度（某些OpenAI格式中转调整该值无效）',
        type: 'select',
        description: '设置生成图像的分辨率。更高的清晰度会生成更详细的图像，但需要更长时间和更多费用。推荐：2K（平衡质量和速度）。注意：某些 OpenAI 格式的中转服务可能不支持此参数。',
        options: [
          { value: '1K', label: '1K (1024px)' },
          { value: '2K', label: '2K (2048px)' },
          { value: '4K', label: '4K (4096px)' },
        ],
      },
    ],
  },
  {
    title: '性能配置',
    icon: <Zap size={20} />,
    fields: [
      {
        key: 'max_description_workers',
        label: '描述生成最大并发数',
        type: 'number',
        min: 1,
        max: 20,
        description: '同时生成描述的最大工作线程数 (1-20)。数值越大，批量生成速度越快，但会消耗更多 API 配额。推荐：5（适合大多数场景）。如果 API 有并发限制，请适当降低此值。',
      },
      {
        key: 'max_image_workers',
        label: '图像生成最大并发数',
        type: 'number',
        min: 1,
        max: 20,
        description: '同时生成图像的最大工作线程数 (1-20)。数值越大，批量生成速度越快，但会消耗更多 API 配额和费用。推荐：8（适合大多数场景）。如果 API 有并发限制或费用较高，请适当降低此值。',
      },
    ],
  },
  {
    title: '输出语言设置',
    icon: <Globe size={20} />,
    fields: [
      {
        key: 'output_language',
        label: '默认输出语言',
        type: 'buttons',
        description: 'AI 生成商品描述、大纲等内容时使用的默认语言。可以在创建项目时单独指定语言，此处设置的是全局默认值。',
        options: OUTPUT_LANGUAGE_OPTIONS,
      },
    ],
  },
];

// Settings 组件 - 纯嵌入模式（可复用）
export const Settings: React.FC = () => {
  const { show, ToastContainer } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const theme = usePortalUiStore((s) => s.theme);

  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isTestingImageModel, setIsTestingImageModel] = useState(false);
  const [formData, setFormData] = useState(initialFormData);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const response = await api.getSettings();
      if (response.data) {
        setSettings(response.data);
        setFormData({
          ai_provider_format: response.data.ai_provider_format || 'gemini',
          api_base_url: response.data.api_base_url || '',
          api_key: '',
          image_resolution: response.data.image_resolution || '2K',
          image_aspect_ratio: response.data.image_aspect_ratio || '3:4',
          max_description_workers: response.data.max_description_workers || 5,
          max_image_workers: response.data.max_image_workers || 8,
          text_model: response.data.text_model || '',
          image_model: response.data.image_model || '',
          mineru_api_base: response.data.mineru_api_base || '',
          mineru_token: '',
          image_caption_model: response.data.image_caption_model || '',
          output_language: response.data.output_language || 'zh',
        });
      }
    } catch (error: any) {
      console.error('加载设置失败:', error);
      show({
        message: '加载设置失败: ' + (error?.message || '未知错误'),
        type: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { api_key, mineru_token, ...otherData } = formData;
      const payload: Parameters<typeof api.updateSettings>[0] = {
        ...otherData,
      };

      if (api_key) {
        payload.api_key = api_key;
      }

      if (mineru_token) {
        payload.mineru_token = mineru_token;
      }

      const response = await api.updateSettings(payload);
      if (response.data) {
        setSettings(response.data);
        show({ message: '设置保存成功', type: 'success' });
        setFormData(prev => ({ ...prev, api_key: '', mineru_token: '' }));
      }
    } catch (error: any) {
      console.error('保存设置失败:', error);
      show({
        message: '保存设置失败: ' + (error?.response?.data?.error?.message || error?.message || '未知错误'),
        type: 'error'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    confirm(
      '此操作将重置以下配置为系统默认值：\n\n• AI 提供商格式和 API 配置\n• 文本和图像生成模型\n• MinerU 配置\n• 图像清晰度和并发数\n• 输出语言设置\n\n⚠️ 注意：已保存的 API Key 和 Token 不会被清除，但其他自定义设置将丢失。\n\n确定要重置吗？',
      async () => {
        setIsSaving(true);
        try {
          const response = await api.resetSettings();
          if (response.data) {
            setSettings(response.data);
            setFormData({
              ai_provider_format: response.data.ai_provider_format || 'gemini',
              api_base_url: response.data.api_base_url || '',
              api_key: '',
              image_resolution: response.data.image_resolution || '2K',
              image_aspect_ratio: response.data.image_aspect_ratio || '3:4',
              max_description_workers: response.data.max_description_workers || 5,
              max_image_workers: response.data.max_image_workers || 8,
              text_model: response.data.text_model || '',
              image_model: response.data.image_model || '',
              mineru_api_base: response.data.mineru_api_base || '',
              mineru_token: '',
              image_caption_model: response.data.image_caption_model || '',
              output_language: response.data.output_language || 'zh',
            });
            show({ message: '设置已重置', type: 'success' });
          }
        } catch (error: any) {
          console.error('重置设置失败:', error);
          show({
            message: '重置设置失败: ' + (error?.message || '未知错误'),
            type: 'error'
          });
        } finally {
          setIsSaving(false);
        }
      },
      {
        title: '确认重置为默认配置',
        confirmText: '确定重置',
        cancelText: '取消',
        variant: 'warning',
      }
    );
  };

  const handleFieldChange = (key: string, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleTestConnection = async () => {
    // 检查是否有可用的 API Key（表单中输入的或者已保存的）
    if (!formData.api_key && (!settings?.api_key_length || settings.api_key_length === 0)) {
      show({ message: '请先输入 API Key', type: 'error' });
      return;
    }

    setIsTesting(true);
    try {
      const response = await api.testConnection({
        ai_provider_format: formData.ai_provider_format,
        api_base_url: formData.api_base_url || undefined,
        api_key: formData.api_key || 'use-saved-key', // 后端会使用已保存的 key
        text_model: formData.text_model || undefined,
      });

      if (response.data?.message) {
        show({ message: String(response.data.message), type: 'success' });
      } else {
        show({ message: '连接成功！', type: 'success' });
      }
    } catch (error: any) {
      const errorMsg = error?.response?.data?.error?.message || error?.message || '连接失败';
      show({ message: `连接失败: ${errorMsg}`, type: 'error' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleTestImageModel = async () => {
    // 检查是否有可用的 API Key（表单中输入的或者已保存的）
    if (!formData.api_key && (!settings?.api_key_length || settings.api_key_length === 0)) {
      show({ message: '请先输入 API Key', type: 'error' });
      return;
    }

    if (!formData.image_model) {
      show({ message: '请先输入图像生成模型名称', type: 'error' });
      return;
    }

    setIsTestingImageModel(true);
    try {
      const response = await api.testImageModel({
        ai_provider_format: formData.ai_provider_format,
        api_base_url: formData.api_base_url || undefined,
        api_key: formData.api_key || 'use-saved-key',
        image_model: formData.image_model,
      });

      if (response.data?.success) {
        show({
          message: `图片模型测试成功！生成了 ${response.data.image_size} 的图片`,
          type: 'success'
        });
      } else {
        show({
          message: `图片模型测试失败: ${response.data?.error || '未知错误'}`,
          type: 'error'
        });
      }
    } catch (error: any) {
      const errorMsg = error?.response?.data?.error?.message || error?.message || '测试失败';
      show({ message: `图片模型测试失败: ${errorMsg}`, type: 'error' });
    } finally {
      setIsTestingImageModel(false);
    }
  };

  const renderField = (field: FieldConfig) => {
    const value = formData[field.key];

    if (field.type === 'buttons' && field.options) {
      return (
        <div key={field.key}>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {field.label}
          </label>
          <div className="flex flex-wrap gap-2">
            {field.options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleFieldChange(field.key, option.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${value === option.value
                  ? option.value === 'openai'
                    ? 'bg-gradient-to-r from-primary-400 to-primary-500 text-white shadow-soft-md'
                    : 'bg-gradient-to-r from-accent to-accent-dark text-white shadow-soft-md'
                  : 'bg-white dark:bg-dark-secondary border border-primary-100 dark:border-white/20 text-text-secondary hover:bg-primary-50 dark:hover:bg-dark-tertiary hover:border-primary-200'
                  }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {field.description && (
            <p className="mt-1 text-xs text-gray-500">{field.description}</p>
          )}
        </div>
      );
    }

    if (field.type === 'select' && field.options) {
      return (
        <div key={field.key}>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {field.label}
          </label>
          <select
            value={value as string}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            className="w-full h-10 px-4 rounded-lg border border-gray-200 dark:border-white/20 bg-white dark:bg-dark-secondary dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent"
          >
            {field.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {field.description && (
            <p className="mt-1 text-sm text-gray-500">{field.description}</p>
          )}
        </div>
      );
    }

    // text, password, number 类型
    const placeholder = field.sensitiveField && settings && field.lengthKey
      ? `已设置（长度: ${settings[field.lengthKey]}）`
      : field.placeholder || '';

    return (
      <div key={field.key}>
        <Input
          label={field.label}
          type={field.type === 'number' ? 'number' : field.type}
          placeholder={placeholder}
          value={value as string | number}
          onChange={(e) => {
            const newValue = field.type === 'number'
              ? parseInt(e.target.value) || (field.min ?? 0)
              : e.target.value;
            handleFieldChange(field.key, newValue);
          }}
          min={field.min}
          max={field.max}
        />
        {field.description && (
          <p className="mt-1 text-sm text-gray-500">{field.description}</p>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loading message="加载设置中..." />
      </div>
    );
  }

  return (
    <>
      <ToastContainer />
      {ConfirmDialog}
      <div className="space-y-8">
        {/* 新手指引 */}
        <div className={`${
          theme === 'dark'
            ? 'bg-gradient-to-br from-slate-800 via-slate-700 to-slate-800 border-slate-600'
            : 'bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 border-blue-200'
        } border rounded-xl p-5 shadow-sm`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={`text-base font-bold ${theme === 'dark' ? 'text-slate-100' : 'text-gray-800'} flex items-center`}>
              <span className="mr-2">📖</span>
              快速配置指南
            </h3>
            <img src="/xobi.svg" alt="Xobi Logo" className="h-8 opacity-80" />
          </div>
          <div className={`text-xs ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'} space-y-2 ${
            theme === 'dark' ? 'bg-slate-900/60' : 'bg-white/50'
          } backdrop-blur-sm rounded-lg p-3 border ${theme === 'dark' ? 'border-slate-700' : 'border-blue-100'}`}>
            <p className="flex items-start"><span className={`font-bold ${theme === 'dark' ? 'text-blue-400' : 'text-primary-600'} mr-2 min-w-[60px]`}>第一步：</span><span>选择 AI 提供商格式（OpenAI 或 Gemini）</span></p>
            <p className="flex items-start"><span className={`font-bold ${theme === 'dark' ? 'text-blue-400' : 'text-primary-600'} mr-2 min-w-[60px]`}>第二步：</span><span>填写 API Base URL 和 API Key（点击下方链接获取）</span></p>
            <p className="flex items-start"><span className={`font-bold ${theme === 'dark' ? 'text-blue-400' : 'text-primary-600'} mr-2 min-w-[60px]`}>第三步：</span><span>配置模型名称（可留空使用默认值）</span></p>
            <p className="flex items-start"><span className={`font-bold ${theme === 'dark' ? 'text-blue-400' : 'text-primary-600'} mr-2 min-w-[60px]`}>第四步：</span><span>点击"测试 API 连接"验证配置是否正确</span></p>
            <p className="flex items-start"><span className={`font-bold ${theme === 'dark' ? 'text-blue-400' : 'text-primary-600'} mr-2 min-w-[60px]`}>第五步：</span><span>点击"保存设置"完成配置</span></p>
          </div>
        </div>

        {/* 配置区块（配置驱动） */}
        <div className="space-y-6">
          {settingsSections.map((section) => (
            <div key={section.title} className={`${
              theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'
            } rounded-xl shadow-sm border p-6 hover:shadow-md transition-shadow duration-200`}>
              <h2 className={`text-lg font-bold ${theme === 'dark' ? 'text-slate-100' : 'text-gray-900'} mb-5 flex items-center pb-3 border-b ${
                theme === 'dark' ? 'border-slate-700' : 'border-gray-100'
              }`}>
                <span className={`flex items-center justify-center w-8 h-8 rounded-lg ${
                  theme === 'dark' ? 'bg-slate-700 text-blue-400' : 'bg-gradient-to-br from-primary-50 to-purple-50 text-primary-600'
                } mr-3`}>
                  {section.icon}
                </span>
                <span>{section.title}</span>
              </h2>
              <div className="space-y-5">
                {section.fields.map((field) => renderField(field))}
                {section.title === '大模型 API 配置' && (
                  <>
                    <div className="mt-4 p-4 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 border border-blue-100 rounded-xl shadow-sm">
                      <p className="text-sm font-semibold text-gray-800 mb-3 flex items-center">
                        <span className="mr-2">🔑</span>
                        API 密匙获取
                      </p>
                      <div className="flex flex-wrap gap-2.5 text-sm mb-3">
                        <a
                          href="https://yunwu.ai"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-lg hover:from-purple-600 hover:to-indigo-700 transition-all font-medium shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                        >
                          <span className="mr-1.5">⭐</span>
                          云雾 AI (推荐)
                        </a>
                        <a
                          href="https://api.kk666.online"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg hover:from-blue-600 hover:to-cyan-600 transition-all font-medium shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                        >
                          酷可
                        </a>
                        <a
                          href="https://aihubmix.com/?aff=17EC"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all font-medium shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                        >
                          AIHubmix
                        </a>
                      </div>
                      <div className="flex items-start gap-2 p-2.5 bg-white/60 backdrop-blur-sm rounded-lg border border-blue-100">
                        <span className="text-base mt-0.5">💡</span>
                        <p className="text-xs text-gray-700 leading-relaxed">
                          <strong>提示：</strong>注册后进入控制台/API 管理页面，创建新的 API Key 并复制到上方输入框
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-3">
                      <Button
                        variant="secondary"
                        icon={<Wifi size={16} />}
                        onClick={handleTestConnection}
                        loading={isTesting}
                        disabled={isTesting || isSaving}
                        className="shadow-sm hover:shadow-md transition-shadow"
                      >
                        {isTesting ? '测试中...' : '测试 API 连接'}
                      </Button>
                    </div>
                  </>
                )}
                {section.title === '模型配置' && (
                  <div className="mt-4 p-4 bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 border border-amber-200 rounded-xl shadow-sm">
                    <div className="flex items-start gap-2 mb-3">
                      <span className="text-base mt-0.5">⚠️</span>
                      <p className="text-sm text-gray-700 leading-relaxed">
                        <strong>建议：</strong>切换图像模型后，先测试该模型是否支持图像生成功能
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      icon={<FlaskConical size={16} />}
                      onClick={handleTestImageModel}
                      loading={isTestingImageModel}
                      disabled={isTestingImageModel || isSaving || !formData.image_model}
                      className="shadow-sm hover:shadow-md transition-shadow"
                    >
                      {isTestingImageModel ? '测试生图中...' : '测试图片模型'}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 操作按钮 */}
        <div className="sticky bottom-0 bg-white/80 backdrop-blur-md border-t border-gray-200 rounded-xl shadow-lg p-5 -mx-2">
          <div className="flex items-center justify-between gap-4">
            <Button
              variant="secondary"
              icon={<RotateCcw size={18} />}
              onClick={handleReset}
              disabled={isSaving}
              className="shadow-sm hover:shadow-md transition-all"
            >
              重置为默认配置
            </Button>
            <Button
              variant="primary"
              icon={<Save size={18} />}
              onClick={handleSave}
              loading={isSaving}
              className="shadow-md hover:shadow-lg transition-all px-8"
            >
              {isSaving ? '保存中...' : '保存设置'}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

// SettingsPage 组件 - 完整页面包装
export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-purple-50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Card className="p-6 md:p-8">
          <div className="space-y-8">
            {/* 顶部标题 */}
            <div className="flex items-center justify-between pb-6 border-b border-gray-200">
              <div className="flex items-center">
                <Button
                  variant="secondary"
                  icon={<Home size={18} />}
                  onClick={() => navigate('/')}
                  className="mr-4"
                >
                  返回首页
                </Button>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">系统设置</h1>
                  <p className="text-sm text-gray-500 mt-1">
                    配置应用的各项参数
                  </p>
                </div>
              </div>
            </div>

            <Settings />
          </div>
        </Card>
      </div>
    </div>
  );
};
