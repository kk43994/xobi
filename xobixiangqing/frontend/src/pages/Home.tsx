import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, FileText, FileEdit, ImagePlus, Paperclip, Palette, Lightbulb, ShoppingBag, Repeat2, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react';
import { BulbOutlined } from '@ant-design/icons';
import { Button, Textarea, Card, useToast, MaterialGeneratorModal, ProductReplaceModal, ReferenceFileList, ReferenceFileSelector, FilePreviewModal, ImagePreviewList } from '@/components/shared';
import { TemplateSelector, getTemplateFile } from '@/components/shared/TemplateSelector';
import { listUserTemplates, type UserTemplate, uploadReferenceFile, type ReferenceFile, associateFileToProject, triggerFileParse, uploadMaterial, associateMaterialsToProject, captionMaterials, type Material } from '@/api/endpoints';
import { useProjectStore } from '@/store/useProjectStore';
import { ECOM_PRESET_STYLES } from '@/config/ecomPresetStyles';

type CreationType = 'ecom' | 'idea' | 'outline' | 'description';

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const { initializeProject, isGlobalLoading } = useProjectStore();
  const { show, ToastContainer } = useToast();

  const [activeTab, setActiveTab] = useState<CreationType>('ecom');
  const [content, setContent] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<File | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedPresetTemplateId, setSelectedPresetTemplateId] = useState<string | null>(null);
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
  const [isProductReplaceOpen, setIsProductReplaceOpen] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [userTemplates, setUserTemplates] = useState<UserTemplate[]>([]);
  const [referenceFiles, setReferenceFiles] = useState<ReferenceFile[]>([]);
  const [uploadedMaterials, setUploadedMaterials] = useState<Material[]>([]);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isFileSelectorOpen, setIsFileSelectorOpen] = useState(false);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [useTemplateStyle, setUseTemplateStyle] = useState(false);
  const [templateStyle, setTemplateStyle] = useState('');
  const [hoveredPresetId, setHoveredPresetId] = useState<string | null>(null);
  const [ecomPageAspectRatio, setEcomPageAspectRatio] = useState('3:4');
  const [isPreparingEcomPrompt, setIsPreparingEcomPrompt] = useState(false);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 检查是否有当前项目 & 加载用户模板
  useEffect(() => {
    const projectId = localStorage.getItem('currentProjectId');
    setCurrentProjectId(projectId);

    // 加载用户模板列表（用于按需获取File）
    const loadTemplates = async () => {
      try {
        const response = await listUserTemplates();
        if (response.data?.templates) {
          setUserTemplates(response.data.templates);
        }
      } catch (error) {
        console.error('加载用户模板失败:', error);
      }
    };
    loadTemplates();
  }, []);

  // 电商模式：默认使用“风格描述（无模板）”以匹配平台风格预设
  useEffect(() => {
    setUseTemplateStyle(true);
    setSelectedTemplate(null);
    setSelectedTemplateId(null);
    setSelectedPresetTemplateId(null);
  }, [activeTab]);

  const handleOpenMaterialModal = () => {
    // 在主页始终生成全局素材，不关联任何项目
    setIsMaterialModalOpen(true);
  };

  // 检测粘贴事件，自动上传文件和图片
  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    console.log('Paste event triggered');
    const items = e.clipboardData?.items;
    if (!items) {
      console.log('No clipboard items');
      return;
    }

    console.log('Clipboard items:', items.length);

    // 检查是否有文件或图片
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      console.log(`Item ${i}:`, { kind: item.kind, type: item.type });

      if (item.kind === 'file') {
        const file = item.getAsFile();
        console.log('Got file:', file);

        if (file) {
          console.log('File details:', { name: file.name, type: file.type, size: file.size });

          // 检查是否是图片
          if (file.type.startsWith('image/')) {
            console.log('Image detected, uploading...');
            e.preventDefault(); // 阻止默认粘贴行为
            await handleImageUpload(file);
            return;
          }

          // 检查文件类型（参考文件）
          const allowedExtensions = ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'csv', 'txt', 'md'];
          const fileExt = file.name.split('.').pop()?.toLowerCase();

          console.log('File extension:', fileExt);

          if (fileExt && allowedExtensions.includes(fileExt)) {
            console.log('File type allowed, uploading...');
            e.preventDefault(); // 阻止默认粘贴行为
            await handleFileUpload(file);
          } else {
            console.log('File type not allowed');
            show({ message: `不支持的文件类型: ${fileExt}`, type: 'info' });
          }
        }
      }
    }
  };

  // 上传图片
  // 在 Home 页面，图片始终上传为全局素材（不关联项目），因为此时还没有项目
  const handleImageUpload = async (file: File) => {
    if (isUploadingFile) return;

    setIsUploadingFile(true);
    try {
      // 显示上传中提示
      show({ message: '正在上传图片...', type: 'info' });

      // 上传图片到素材库（全局素材）
      const response = await uploadMaterial(file, null);

      const material = response?.data;
      if (material?.url) {
        setUploadedMaterials((prev) => {
          if (prev.some((m) => m.url === material.url)) return prev;
          return [...prev, material];
        });

        show({ message: '图片上传成功！已添加到图片列表', type: 'success' });
      } else {
        show({ message: '图片上传失败：未返回图片信息', type: 'error' });
      }
    } catch (error: any) {
      setIsPreparingEcomPrompt(false);
      console.error('图片上传失败:', error);
      show({
        message: `图片上传失败: ${error?.response?.data?.error?.message || error.message || '未知错误'}`,
        type: 'error'
      });
    } finally {
      setIsUploadingFile(false);
    }
  };

  // 上传文件
  // 在 Home 页面，文件始终上传为全局文件（不关联项目），因为此时还没有项目
  const handleFileUpload = async (file: File) => {
    if (isUploadingFile) return;

    // 检查文件大小（前端预检查）
    const maxSize = 200 * 1024 * 1024; // 200MB
    if (file.size > maxSize) {
      show({
        message: `文件过大：${(file.size / 1024 / 1024).toFixed(1)}MB，最大支持 200MB`,
        type: 'error'
      });
      return;
    }

    setIsUploadingFile(true);
    try {
      // 在 Home 页面，始终上传为全局文件
      const response = await uploadReferenceFile(file, null);
      if (response?.data?.file) {
        const uploadedFile = response.data.file;
        setReferenceFiles(prev => [...prev, uploadedFile]);
        show({ message: '文件上传成功', type: 'success' });

        // 如果文件状态为 pending，自动触发解析
        if (uploadedFile.parse_status === 'pending') {
          try {
            const parseResponse = await triggerFileParse(uploadedFile.id);
            // 使用解析接口返回的文件对象更新状态
            if (parseResponse?.data?.file) {
              const parsedFile = parseResponse.data.file;
              setReferenceFiles(prev =>
                prev.map(f => f.id === uploadedFile.id ? parsedFile : f)
              );
            } else {
              // 如果没有返回文件对象，手动更新状态为 parsing（异步线程会稍后更新）
              setReferenceFiles(prev =>
                prev.map(f => f.id === uploadedFile.id ? { ...f, parse_status: 'parsing' as const } : f)
              );
            }
          } catch (parseError: any) {
            console.error('触发文件解析失败:', parseError);
            // 解析触发失败不影响上传成功提示
          }
        }
      } else {
        show({ message: '文件上传失败：未返回文件信息', type: 'error' });
      }
    } catch (error: any) {
      console.error('文件上传失败:', error);

      // 特殊处理413错误
      if (error?.response?.status === 413) {
        show({
          message: `文件过大：${(file.size / 1024 / 1024).toFixed(1)}MB，最大支持 200MB`,
          type: 'error'
        });
      } else {
        show({
          message: `文件上传失败: ${error?.response?.data?.error?.message || error.message || '未知错误'}`,
          type: 'error'
        });
      }
    } finally {
      setIsUploadingFile(false);
    }
  };

  // 从当前项目移除文件引用（不删除文件本身）
  const handleFileRemove = (fileId: string) => {
    setReferenceFiles(prev => prev.filter(f => f.id !== fileId));
  };

  // 文件状态变化回调
  const handleFileStatusChange = (updatedFile: ReferenceFile) => {
    setReferenceFiles(prev =>
      prev.map(f => f.id === updatedFile.id ? updatedFile : f)
    );
  };

  // 点击回形针按钮 - 打开文件选择器
  const handlePaperclipClick = () => {
    setIsFileSelectorOpen(true);
  };

  // 从选择器选择文件后的回调
  const handleFilesSelected = (selectedFiles: ReferenceFile[]) => {
    // 合并新选择的文件到列表（去重）
    setReferenceFiles(prev => {
      const existingIds = new Set(prev.map(f => f.id));
      const newFiles = selectedFiles.filter(f => !existingIds.has(f.id));
      // 合并时，如果文件已存在，更新其状态（可能解析状态已改变）
      const updated = prev.map(f => {
        const updatedFile = selectedFiles.find(sf => sf.id === f.id);
        return updatedFile || f;
      });
      return [...updated, ...newFiles];
    });
    show({ message: `已添加 ${selectedFiles.length} 个参考文件`, type: 'success' });
  };

  // 获取当前已选择的文件ID列表，传递给选择器（使用 useMemo 避免每次渲染都重新计算）
  const selectedFileIds = useMemo(() => {
    return referenceFiles.map(f => f.id);
  }, [referenceFiles]);

  // 从已上传图片列表中移除图片（同时兼容移除 content 中的 markdown 图片链接）
  const handleRemoveImage = (imageUrl: string) => {
    setUploadedMaterials((prev) => prev.filter((m) => m.url !== imageUrl));
    setContent(prev => {
      // 移除所有匹配该URL的markdown图片链接
      const imageRegex = new RegExp(`!\\[[^\\]]*\\]\\(${imageUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'g');
      let newContent = prev.replace(imageRegex, '');

      // 清理多余的空行（最多保留一个空行）
      newContent = newContent.replace(/\n{3,}/g, '\n\n');

      return newContent.trim();
    });

    show({ message: '已移除图片', type: 'success' });
  };

  // 文件选择变化
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      await handleFileUpload(files[i]);
    }

    // 清空 input，允许重复选择同一文件
    e.target.value = '';
  };

  // 图片选择变化（商品图上传）
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.type.startsWith('image/')) {
      show({ message: '请选择图片文件', type: 'error' });
      e.target.value = '';
      return;
    }

    await handleImageUpload(file);
    e.target.value = '';
  };

  const tabConfig = {
    ecom: {
      icon: <ShoppingBag size={20} />,
      label: '电商详情页',
      placeholder: '先上传一张商品图（上方点击/拖拽/粘贴），再补充：商品名、核心卖点、材质/规格、适用场景、目标人群、价格区间等…',
      description: '上传商品图片，一键生成电商详情页多张单图（主图 1:1，其余默认 3:4，可在下方选择）',
    },
    idea: {
      icon: <Sparkles size={20} />,
      label: '纯文本生成',
      placeholder: '例如：冬季女士羽绒服，轻薄保暖，90%白鸭绒，可机洗，适合通勤；目标人群 25-35；主打性价比。',
      description: '不上传图片也可以：仅基于文字生成详情页结构与逐页文案，再批量出图',
    },
    outline: {
      icon: <FileText size={20} />,
      label: '从结构生成',
      placeholder: '粘贴你的详情页结构...\n\n例如：\n1. 封面/主视觉\n- 商品名+一句话卖点\n2. 核心卖点\n- 卖点1/卖点2/卖点3\n3. 细节展示\n- 面料/工艺/做工\n4. 规格参数\n- 尺码/材质/重量\n5. 服务保障\n- 售后/发货/退换\n...',
      description: '已有详情页结构？直接粘贴即可，AI 将自动切分为逐页结构并生成对应文案',
    },
    description: {
      icon: <FileEdit size={20} />,
      label: '从逐页文案生成',
      placeholder: '粘贴你的逐页文案...\n\n例如：\n第 1 张\n标题：轻薄羽绒服\n内容：一穿就暖 · 不臃肿\n\n第 2 张\n标题：90% 白鸭绒\n内容：蓬松回弹 · 保暖锁温\n\n第 3 张\n标题：细节做工\n内容：走线工整 · 拉链顺滑\n...',
      description: '已有完整逐页文案？AI 将自动解析并直接生成多张详情页图片',
    },
  };

  const handleTemplateSelect = async (templateFile: File | null, templateId?: string) => {
    // 总是设置文件（如果提供）
    if (templateFile) {
      setSelectedTemplate(templateFile);
    }

    // 处理模板 ID
    if (templateId) {
      // 判断是用户模板还是预设模板
      // 预设模板 ID 通常是 '1', '2', '3' 等短字符串
      // 用户模板 ID 通常较长（UUID 格式）
      if (templateId.length <= 3 && /^\d+$/.test(templateId)) {
        // 预设模板
        setSelectedPresetTemplateId(templateId);
        setSelectedTemplateId(null);
      } else {
        // 用户模板
        setSelectedTemplateId(templateId);
        setSelectedPresetTemplateId(null);
      }
    } else {
      // 如果没有 templateId，可能是直接上传的文件
      // 清空所有选择状态
      setSelectedTemplateId(null);
      setSelectedPresetTemplateId(null);
    }
  };

  const handleSubmit = async () => {
    if (activeTab !== 'ecom' && !content.trim()) {
      show({ message: '请输入内容', type: 'error' });
      return;
    }

    // 检查是否有正在解析的文件
    const parsingFiles = referenceFiles.filter(f =>
      f.parse_status === 'pending' || f.parse_status === 'parsing'
    );
    if (parsingFiles.length > 0) {
      show({
        message: `还有 ${parsingFiles.length} 个参考文件正在解析中，请等待解析完成`,
        type: 'info'
      });
      return;
    }

    try {
      // 如果有模板ID但没有File，按需加载
      let templateFile = selectedTemplate;
      if (!templateFile && (selectedTemplateId || selectedPresetTemplateId)) {
        const templateId = selectedTemplateId || selectedPresetTemplateId;
        if (templateId) {
          templateFile = await getTemplateFile(templateId, userTemplates);
        }
      }

      // 传递风格描述（只要有内容就传递，不管开关状态）
      const styleDesc = templateStyle.trim() ? templateStyle.trim() : undefined;

      const coverRatio = '1:1';
      const initType = (activeTab === 'ecom' ? 'idea' : activeTab) as 'idea' | 'outline' | 'description';
      let initContent = content;
      const projectOptions: { project_type: 'ecom'; page_aspect_ratio: string; cover_aspect_ratio: string } = {
        project_type: 'ecom',
        page_aspect_ratio: ecomPageAspectRatio,
        cover_aspect_ratio: coverRatio,
      };

      if (activeTab === 'ecom') {
        const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
        const materialUrls: string[] = uploadedMaterials.map((m) => m.url).filter(Boolean);
        let match;
        while ((match = imageRegex.exec(content)) !== null) {
          materialUrls.push(match[2]);
        }

        // 去重
        const uniqueMaterialUrls = Array.from(new Set(materialUrls));
        if (uniqueMaterialUrls.length === 0) {
          show({ message: '请先上传至少一张商品图', type: 'error' });
          return;
        }

        setIsPreparingEcomPrompt(true);

        const cleanedText = content
          .replace(imageRegex, '')
          .replace(/\\n{3,}/g, '\\n\\n')
          .trim();

        let combinedCaption = '';
        if (uniqueMaterialUrls.length > 0) {
          console.log('=== 开始产品图片识别 ===');
          console.log('发送的图片URL:', uniqueMaterialUrls.slice(0, 3));
          try {
             const capResp = await captionMaterials(
               uniqueMaterialUrls.slice(0, 3),
               '请严格按以下格式输出一行（不要多余解释、不要换行）：' +
                 '品类=...；材质=...；外观=...；电子部件=无/有/不确定；可见文字=...' +
                 '。规则：1) 只描述你在图中看见的**实物产品本身**（如鼠标、杯子等）；2) **忽略背景中**的屏幕、显示器、文字、代码、网页内容，绝对不要把背景当成产品；3) 不要推测"LED/充电/续航/智能"等；4) 看不出电子部件时必须写"电子部件=无"；5) 产品名若看不清就不要写。'
             );
             console.log('captionMaterials 响应:', capResp);
             combinedCaption = capResp.data?.combined_caption?.trim() || '';
             const looksLikeHtml = /<!doctype\s+html|<html\b|<head\b|<meta\b|<script\b|<\/html>/i.test(
               combinedCaption
             );
             if (looksLikeHtml) {
               setIsPreparingEcomPrompt(false);
               show({
                 message:
                   '产品图片识别返回了网页源码（疑似 API Base 配置错误）。请到「设置」把 API Base 设为 OpenAI 兼容的 /v1 地址（例如 https://yunwu.ai/v1），然后重试。',
                 type: 'error',
               });
               return;
             }
             console.log('识别结果 combinedCaption:', combinedCaption || '(空)');
           } catch (e) {
             console.error('=== captionMaterials 调用失败! ===');
             console.error('错误详情:', e);
             // 识别失败，阻止继续生成
            setIsPreparingEcomPrompt(false);
            show({ message: '产品图片识别失败，请检查后端服务后重试', type: 'error' });
            return;
          }
          console.log('=== 产品图片识别结束 ===');

          // 如果识别结果为空，阻止生成大纲浪费tokens
          if (!combinedCaption) {
            setIsPreparingEcomPrompt(false);
            show({ message: '未能识别出产品信息，请检查图片是否清晰可见', type: 'error' });
            return;
          }
        }

        const extractProductNameFromText = (text: string): string => {
          const raw = (text || '').trim();
          if (!raw) return '';

          const lines = raw
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean);
          const firstLine = lines[0] || '';
          const isFirstLineCandidate =
            firstLine &&
            firstLine.length <= 30 &&
            !/[：:]/.test(firstLine) &&
            !/^(用户补充信息|补充信息|说明|需求|要求)\b/i.test(firstLine);
          if (isFirstLineCandidate) return firstLine;

          const patterns: RegExp[] = [
            /(?:产品名|商品名|名称|名字)\s*[：:]\s*([^\n]{1,30})/i,
            /我名字叫\s*([^\n，,。]{1,30})/i,
            /名字叫\s*([^\n，,。]{1,20})/i,
            /我叫\s*([^\n，,。]{1,20})/i,
          ];
          for (const pattern of patterns) {
            const m = raw.match(pattern);
            if (!m) continue;
            let name = (m[1] || '').trim();
            name = name.replace(/^["'“”‘’]+/, '').replace(/["'“”‘’]+$/, '');
            // Stop at common separators / disclaimers.
            name = name.split(/\s+/)[0] || name;
            name = name.split(/不是/)[0] || name;
            name = name.replace(/[。！!，,;；…\s]+$/g, '').trim();
            name = name.replace(/^(叫|是)\s*/g, '').trim();
            name = name.replace(/(不是|非)\s*(LED|led|USB|usb|充电|电池).*$/i, '').trim();
            if (name && name.length <= 30) return name;
          }

          return '';
        };

        const productName = extractProductNameFromText(cleanedText);

        const userSaysNonElectronic =
          /毛绒|布偶|布娃娃|玩偶|公仔|非电子|不带电|不带灯|不发光|不是\s*(led|LED|usb|USB|充电|电池)/i.test(
            cleanedText
          );
        const userSaysElectronic = /电子部件\s*=\s*有|带\s*(led|LED|usb|USB|充电|电池)/i.test(cleanedText);
        const captionSaysNonElectronic = /电子部件\s*=\s*无/i.test(combinedCaption);
        const captionLooksPlush = /毛绒|布偶|布娃娃|玩偶|公仔/i.test(combinedCaption);

        const nonElectronicHint =
          userSaysNonElectronic || (!userSaysElectronic && (captionSaysNonElectronic || captionLooksPlush));

        const normalizeCaptionForNonElectronic = (caption: string): string => {
          const raw = (caption || '').trim();
          if (!raw || !nonElectronicHint) return raw;

          let out = raw.replace(/电子部件\s*=\s*有/gi, '电子部件=无');
          if (!/电子部件\s*=\s*(无|有|不确定)/i.test(out)) {
            out = out ? `${out}；电子部件=无` : '电子部件=无';
          }
          out = out.replace(
            /(?:LED|USB|Type-?C|充电|电池|续航|智能|传感|电机|马达|APP|蓝牙|语音|遥控)/gi,
            ''
          );
          out = out
            .replace(/；\s*；/g, '；')
            .replace(/；{2,}/g, '；')
            .replace(/^；+|；+$/g, '')
            .trim();
          return out;
        };

        const normalizedCaption = normalizeCaptionForNonElectronic(combinedCaption);

        // 构建 idea_prompt - 只包含产品相关信息，不包含 AI 人设（人设在后端 prompt 模板中）
        // 项目标题/需求应该是用户和产品相关的内容
        initContent = [
          productName ? `产品名：${productName}` : '',
          normalizedCaption ? `商品图分析：${normalizedCaption}` : '',
          nonElectronicHint
            ? '硬性约束：非电子类产品，禁止出现 LED/USB/充电/电池/续航/智能传感/电机 等电子卖点。'
            : '',
          cleanedText ? `用户补充信息：${cleanedText}` : '',
          `输出比例：主图 ${coverRatio}；详情页 ${ecomPageAspectRatio}`,
        ]
          .filter(Boolean)
          .join('\n');
      }

      await initializeProject(initType, initContent, templateFile || undefined, styleDesc, projectOptions);
      setIsPreparingEcomPrompt(false);

      // 根据类型跳转到不同页面
      const projectId = localStorage.getItem('currentProjectId');
      if (!projectId) {
        show({ message: '项目创建失败', type: 'error' });
        return;
      }

      // 关联参考文件到项目
      if (referenceFiles.length > 0) {
        console.log(`Associating ${referenceFiles.length} reference files to project ${projectId}:`, referenceFiles);
        try {
          // 批量更新文件的 project_id
          const results = await Promise.all(
            referenceFiles.map(async file => {
              const response = await associateFileToProject(file.id, projectId);
              console.log(`Associated file ${file.id}:`, response);
              return response;
            })
          );
          console.log('Reference files associated successfully:', results);
        } catch (error) {
          console.error('Failed to associate reference files:', error);
          // 不影响主流程，继续执行
        }
      } else {
        console.log('No reference files to associate');
      }

      // 关联图片素材到项目（优先使用已上传图片列表，同时兼容 content 中的 markdown 图片链接）
      const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
      const materialUrls: string[] = uploadedMaterials.map((m) => m.url).filter(Boolean);
      let match;
      while ((match = imageRegex.exec(content)) !== null) {
        materialUrls.push(match[2]); // match[2] 是 URL
      }

      const uniqueMaterialUrls = Array.from(new Set(materialUrls));
      if (uniqueMaterialUrls.length > 0) {
        console.log(`Associating ${uniqueMaterialUrls.length} materials to project ${projectId}:`, uniqueMaterialUrls);
        try {
          const response = await associateMaterialsToProject(projectId, uniqueMaterialUrls);
          console.log('Materials associated successfully:', response);
        } catch (error) {
          console.error('Failed to associate materials:', error);
          // 不影响主流程，继续执行
        }
      } else {
        console.log('No materials to associate');
      }

      if (activeTab === 'ecom' || activeTab === 'idea' || activeTab === 'outline') {
        navigate(`/projects/${projectId}/workbench`);
      } else if (activeTab === 'description') {
        // 从描述生成：直接跳到描述生成页（因为已经自动生成了大纲和描述）
        navigate(`/projects/${projectId}/detail`);
      }
    } catch (error: any) {
      setIsPreparingEcomPrompt(false);
      console.error('创建项目失败:', error);
      // 错误已经在 store 中处理并显示
    }
  };

  return (
    <div className="w-full" style={{ paddingTop: 'var(--xobi-toolbar-safe-top)' }}>
      <main className="relative max-w-5xl mx-auto px-3 md:px-4 py-8 md:py-12">
        <div className="flex items-center justify-end gap-2 mb-6">
          <Button
            variant="secondary"
            size="sm"
            icon={<ImagePlus size={16} className="md:w-[18px] md:h-[18px]" />}
            onClick={handleOpenMaterialModal}
          >
            素材生成
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<Repeat2 size={16} className="md:w-[18px] md:h-[18px]" />}
            onClick={() => setIsProductReplaceOpen(true)}
          >
            产品替换
          </Button>
        </div>

        {/* Hero 标题区 - 简化版 */}
        <div className="text-center mb-8 md:mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-3">
            <span className="bg-gradient-cta bg-clip-text text-transparent">
              创建详情页项目
            </span>
          </h1>
          <p className="text-base md:text-lg text-text-secondary">
            上传商品图或输入文本，AI 自动生成电商详情页
          </p>
        </div>

        {/* 创建卡片 */}
        <Card className="p-4 md:p-10 bg-white dark:bg-dark-secondary/90 backdrop-blur-xl shadow-2xl border border-primary-200 dark:border-white/10 hover:shadow-glow transition-all duration-300">
          {/* 步骤1：选择创建方式 - 2x2卡片网格 */}
          <div className="mb-6 md:mb-8">
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">选择创建方式</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
              {(Object.keys(tabConfig) as CreationType[]).map((type) => {
                const config = tabConfig[type];
                const isActive = activeTab === type;
                return (
                  <button
                    key={type}
                    onClick={() => setActiveTab(type)}
                    className={`relative p-4 md:p-5 rounded-xl border-2 transition-all duration-300 text-left ${
                      isActive
                        ? 'border-purple-vibrant bg-purple-vibrant/10 shadow-glow transform scale-[1.02]'
                        : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-dark-tertiary/50 hover:border-purple-vibrant/50 hover:bg-gray-100 dark:hover:bg-dark-elevated'
                    }`}
                  >
                    {/* 图标 */}
                    <div
                      className={`w-12 h-12 rounded-lg flex items-center justify-center mb-3 transition-all ${
                        isActive
                          ? 'bg-gradient-cta text-white'
                          : 'bg-primary-100 dark:bg-dark-elevated text-purple-apple'
                      }`}
                    >
                      {config.icon}
                    </div>

                    {/* 标题 */}
                    <h3 className={`text-base md:text-lg font-bold mb-2 ${isActive ? 'text-purple-vibrant' : 'text-gray-900 dark:text-white'}`}>
                      {config.label}
                    </h3>

                    {/* 描述 - 永远可见 */}
                    <p className="text-sm text-text-secondary leading-relaxed">
                      {config.description}
                    </p>

                    {/* 选中标识 */}
                    {isActive && (
                      <div className="absolute top-3 right-3">
                        <div className="w-6 h-6 rounded-full bg-purple-vibrant flex items-center justify-center">
                          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 步骤2：电商模式 - 大型商品图上传区 */}
          {activeTab === 'ecom' && (
            <div className="mb-6 md:mb-8">
              <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">上传商品图片</h2>
              <div
                role="button"
                tabIndex={0}
                onClick={() => imageInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') imageInputRef.current?.click();
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setIsDraggingImage(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingImage(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setIsDraggingImage(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingImage(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file && file.type.startsWith('image/')) {
                    handleImageUpload(file);
                  } else {
                    show({ message: '请拖拽图片文件', type: 'error' });
                  }
                }}
                className={`relative h-64 rounded-xl border-2 border-dashed transition-all duration-300 cursor-pointer flex flex-col items-center justify-center group ${
                  isDraggingImage
                    ? 'border-purple-vibrant bg-purple-vibrant/10 scale-[1.01]'
                    : uploadedMaterials.length === 0
                    ? 'border-gray-300 dark:border-white/20 hover:border-purple-vibrant/50 bg-gray-50 dark:bg-dark-tertiary/30 hover:bg-gray-100 dark:hover:bg-dark-elevated/50'
                    : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-dark-tertiary/20'
                }`}
              >
                {uploadedMaterials.length === 0 ? (
                  <>
                    <ImagePlus
                      size={48}
                      className={`mb-4 transition-all duration-300 ${
                        isDraggingImage
                          ? 'text-purple-vibrant scale-110'
                          : 'text-purple-apple group-hover:scale-110'
                      }`}
                    />
                    <p className="text-lg font-medium mb-2 text-gray-900 dark:text-white">点击上传或拖拽商品图片</p>
                    <p className="text-sm text-text-secondary">支持 JPG、PNG、WEBP，最多5张</p>
                    <p className="text-xs text-text-tertiary mt-2">也可以在下方输入框粘贴图片（Ctrl+V）</p>
                  </>
                ) : (
                  /* 图片网格预览 - 直接在上传区内 */
                  <div className="grid grid-cols-3 gap-4 p-6 w-full">
                    {uploadedMaterials.map((material, idx) => (
                      <div key={material.url} className="relative group">
                        <img
                          src={material.url}
                          alt={material.original_filename || `商品图${idx + 1}`}
                          className="w-full h-32 object-cover rounded-lg border border-gray-200 dark:border-white/10"
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveImage(material.url);
                          }}
                          className="absolute top-2 right-2 w-8 h-8 bg-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-600"
                        >
                          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                    {/* 添加更多按钮 */}
                    {uploadedMaterials.length < 5 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          imageInputRef.current?.click();
                        }}
                        className="h-32 border-2 border-dashed border-gray-300 dark:border-white/20 rounded-lg flex flex-col items-center justify-center hover:border-purple-vibrant/50 hover:bg-gray-50 dark:hover:bg-white/5 transition-all"
                      >
                        <ImagePlus size={24} className="text-purple-apple mb-1" />
                        <span className="text-xs text-text-secondary">添加更多</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* 隐藏的图片输入 */}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageSelect}
                className="hidden"
              />
            </div>
          )}

          {/* 步骤3：补充信息输入（电商模式：紧凑设计） */}
          {activeTab === 'ecom' && (
            <div className="mb-6 md:mb-8">
              <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">补充产品信息（可选）</h2>
              <div className="relative group">
                <Textarea
                  ref={textareaRef}
                  placeholder="补充产品信息（可选）：名称、卖点、材质、规格..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onPaste={handlePaste}
                  rows={3}
                  className="relative pr-20 md:pr-28 text-sm md:text-base border-2 border-gray-200 dark:border-white/10 focus:border-purple-vibrant transition-colors duration-200"
                />

                {/* 左下角：参考文件按钮（回形针图标） */}
                <button
                  type="button"
                  onClick={handlePaperclipClick}
                  className="absolute left-2 md:left-3 bottom-2 md:bottom-3 z-10 p-1.5 md:p-2 text-text-tertiary hover:text-purple-vibrant dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors active:scale-95 touch-manipulation"
                  title="选择参考文件"
                >
                  <Paperclip size={18} className="md:w-5 md:h-5" />
                </button>
              </div>

              {/* 电商模式：风格描述直接显示在这里 */}
              <div className="mt-4">
                <label className="text-sm font-semibold text-gray-900 dark:text-white mb-2 block">风格偏好（可选）</label>
                <Textarea
                  placeholder="描述您想要的详情页风格，例如：淘宝促销风格，橙白配色，模块化卖点标签..."
                  value={templateStyle}
                  onChange={(e) => setTemplateStyle(e.target.value)}
                  rows={2}
                  className="text-sm border-2 border-gray-200 dark:border-white/10 focus:border-purple-vibrant transition-colors duration-200"
                />

                {/* 预设风格快捷按钮 */}
                <div className="mt-3">
                  <p className="text-xs font-medium text-text-secondary mb-2">快速选择预设平台风格：</p>
                  <div className="flex flex-wrap gap-2">
                    {ECOM_PRESET_STYLES.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setTemplateStyle(preset.description)}
                        className="px-3 py-1.5 text-xs font-medium rounded-full border border-gray-300 dark:border-white/20 text-gray-600 dark:text-text-secondary hover:border-purple-vibrant/50 hover:bg-purple-vibrant/10 hover:text-purple-vibrant dark:hover:text-white transition-all duration-200"
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-text-tertiary mt-2 flex items-center gap-1">
                    <BulbOutlined />
                    <span>点击平台名称快速填充对应风格描述，也可以自己编写</span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 步骤3：其他模式 - 完整文本输入区 */}
          {activeTab !== 'ecom' && (
            <div className="mb-6 md:mb-8">
              <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">输入内容</h2>
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-cta rounded-lg opacity-0 group-hover:opacity-20 blur transition-opacity duration-300"></div>
                <Textarea
                  ref={textareaRef}
                  placeholder={tabConfig[activeTab].placeholder}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onPaste={handlePaste}
                  rows={8}
                  className="relative pr-20 md:pr-28 pb-12 md:pb-14 text-sm md:text-base border-2 border-gray-200 dark:border-white/10 focus:border-purple-vibrant transition-colors duration-200"
                />

                {/* 左下角：参考文件按钮（回形针图标） */}
                <button
                  type="button"
                  onClick={handlePaperclipClick}
                  className="absolute left-2 md:left-3 bottom-2 md:bottom-3 z-10 p-1.5 md:p-2 text-text-tertiary hover:text-purple-vibrant dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors active:scale-95 touch-manipulation"
                  title="选择参考文件"
                >
                  <Paperclip size={18} className="md:w-5 md:h-5" />
                </button>

                {/* 右下角：开始生成按钮 */}
                <div className="absolute right-2 md:right-3 bottom-2 md:bottom-3 z-10">
                  <Button
                    size="sm"
                    onClick={handleSubmit}
                    loading={isGlobalLoading || isPreparingEcomPrompt}
                    disabled={
                      isPreparingEcomPrompt ||
                      !content.trim() ||
                      referenceFiles.some(f => f.parse_status === 'pending' || f.parse_status === 'parsing')
                    }
                    className="shadow-sm text-xs md:text-sm px-3 md:px-4"
                  >
                    {referenceFiles.some(f => f.parse_status === 'pending' || f.parse_status === 'parsing')
                      ? '解析中...'
                      : '下一步'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* 隐藏的文件输入 */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* 参考文件列表 */}
          <ReferenceFileList
            files={referenceFiles}
            onFileClick={setPreviewFileId}
            onFileDelete={handleFileRemove}
            onFileStatusChange={handleFileStatusChange}
            deleteMode="remove"
            className="mb-4"
          />

          {/* 步骤4：高级选项（可折叠，默认收起） - 仅包含详情页比例和模板 */}
          <div className="mb-6 md:mb-8">
            <button
              type="button"
              onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
              className="w-full flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-dark-tertiary/30 border border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-dark-elevated/50 transition-all group"
            >
              <div className="flex items-center gap-2">
                <Palette size={18} className="text-purple-apple" />
                <span className="text-base font-semibold text-gray-900 dark:text-white">高级设置</span>
                <span className="text-xs text-text-tertiary">（详情页比例、模板上传等）</span>
              </div>
              {showAdvancedOptions ? (
                <ChevronUp size={20} className="text-text-secondary group-hover:text-purple-vibrant dark:group-hover:text-white transition-colors" />
              ) : (
                <ChevronDown size={20} className="text-text-secondary group-hover:text-purple-vibrant dark:group-hover:text-white transition-colors" />
              )}
            </button>

            {showAdvancedOptions && (
              <div className="mt-4 space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                {/* 详情页比例（仅电商模式） */}
                {activeTab === 'ecom' && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-semibold text-gray-900 dark:text-white">详情页图片比例</label>
                      <span className="text-xs text-text-tertiary">主图固定 1:1</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {['3:4', '4:5', '1:1', '9:16', '16:9'].map((ratio) => (
                        <button
                          key={ratio}
                          type="button"
                          onClick={() => setEcomPageAspectRatio(ratio)}
                          className={`px-4 py-2 text-sm font-medium rounded-lg border-2 transition-all duration-200 ${
                            ecomPageAspectRatio === ratio
                              ? 'border-purple-vibrant bg-purple-vibrant/20 text-purple-vibrant dark:text-white'
                              : 'border-gray-300 dark:border-white/20 text-gray-600 dark:text-text-secondary hover:border-purple-vibrant/50 hover:bg-gray-50 dark:hover:bg-white/5'
                          }`}
                        >
                          {ratio}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-text-tertiary mt-2">
                      选择详情页其余图片的比例（第一张主图始终为 1:1 方形）
                    </p>
                  </div>
                )}

                {/* 使用风格模板（而非风格描述） */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-semibold text-gray-900 dark:text-white">参考模板图片</label>
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <span className="text-xs text-text-secondary group-hover:text-purple-vibrant dark:group-hover:text-white transition-colors">
                        启用模板参考
                      </span>
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={!useTemplateStyle}
                          onChange={(e) => {
                            setUseTemplateStyle(!e.target.checked);
                            if (e.target.checked) {
                              // 启用模板参考时保留当前选择
                            } else {
                              // 禁用模板参考时清空选择
                              setSelectedTemplate(null);
                              setSelectedTemplateId(null);
                              setSelectedPresetTemplateId(null);
                            }
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-gray-300 dark:bg-dark-tertiary peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-vibrant/30 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-vibrant"></div>
                      </div>
                    </label>
                  </div>

                  {!useTemplateStyle && (
                    <div className="p-4 bg-gray-50 dark:bg-dark-tertiary/30 rounded-lg border border-gray-200 dark:border-white/10">
                      <TemplateSelector
                        onSelect={handleTemplateSelect}
                        selectedTemplateId={selectedTemplateId}
                        selectedPresetTemplateId={selectedPresetTemplateId}
                        showUpload={true}
                        projectId={currentProjectId}
                      />
                      <p className="text-xs text-text-tertiary mt-3">
                        上传参考图片后，AI 会模仿其版式和风格（注意：这会覆盖上面的"风格偏好"描述）
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 大按钮：开始生成（电商模式） */}
          {activeTab === 'ecom' && (
            <div className="sticky bottom-0 bg-white/95 dark:bg-dark-secondary/95 backdrop-blur-sm border-t border-gray-200 dark:border-white/10 p-4 -mx-4 md:-mx-10 -mb-4 md:-mb-10">
              <div className="max-w-5xl mx-auto">
                <Button
                  onClick={handleSubmit}
                  loading={isGlobalLoading || isPreparingEcomPrompt}
                  disabled={
                    isPreparingEcomPrompt ||
                    uploadedMaterials.length === 0 ||
                    referenceFiles.some(f => f.parse_status === 'pending' || f.parse_status === 'parsing')
                  }
                  className="w-full h-14 text-lg font-semibold rounded-xl bg-gradient-cta hover:shadow-glow hover:scale-[1.01] transition-all duration-200 flex items-center justify-center gap-2"
                >
                  {isGlobalLoading || isPreparingEcomPrompt ? (
                    '正在处理...'
                  ) : referenceFiles.some(f => f.parse_status === 'pending' || f.parse_status === 'parsing') ? (
                    '解析中...'
                  ) : uploadedMaterials.length === 0 ? (
                    '请先上传商品图片'
                  ) : (
                    <>
                      开始生成
                      <ArrowRight size={20} />
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* 移除老的模板选择区域（已合并到高级选项） */}

        </Card>
      </main>
      <ToastContainer />
      {/* 素材生成模态 - 在主页始终生成全局素材 */}
      <MaterialGeneratorModal
        projectId={null}
        isOpen={isMaterialModalOpen}
        onClose={() => setIsMaterialModalOpen(false)}
      />
      <ProductReplaceModal
        isOpen={isProductReplaceOpen}
        onClose={() => setIsProductReplaceOpen(false)}
      />
      {/* 参考文件选择器 */}
      {/* 在 Home 页面，始终查询全局文件，因为此时还没有项目 */}
      <ReferenceFileSelector
        projectId={null}
        isOpen={isFileSelectorOpen}
        onClose={() => setIsFileSelectorOpen(false)}
        onSelect={handleFilesSelected}
        multiple={true}
        initialSelectedIds={selectedFileIds}
      />

      <FilePreviewModal fileId={previewFileId} onClose={() => setPreviewFileId(null)} />
    </div>
  );
};
