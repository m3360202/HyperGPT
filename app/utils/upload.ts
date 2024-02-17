import OSS from "ali-oss";
import { useCurrentFile } from "../store/upload";

export async function uploadFile(file: any) {
  if (!file) return;

  // 阿里云OSS配置
  const client = new OSS({
    region: "oss-ap-southeast-1", // 你的OSS区域
    accessKeyId: "LTAI5tAaKKjp1vPaQunjKo8g", // 替换为你的AccessKeyId
    accessKeySecret: "nP9eNZ8uykazcgij5wwl6MTDm9tuDU", // 替换为你的AccessKeySecret
    bucket: "hypergpt", // 你的Bucket名称
  });

  // 确保文件名没有斜杠开头
  let fileId = `${Date.now()}`;
  let fileName = `images/${Date.now()}.${file.name.split(".").pop()}`;
  let url = `https://hypergpt.oss-ap-southeast-1.aliyuncs.com/${fileName}`;

  try {
    // 如果file是一个File对象，需要转换为Buffer
    const fileBuffer = await readFileAsBuffer(file);

    // 上传文件到OSS
    await client.put(fileName, fileBuffer);
    //console.log("上传成功:", uploadResult);

    // 更新useCurrentFile store
    useCurrentFile.setState({ id: fileId, url: url });
  } catch (error) {
    console.error("发生错误:", error);
    // 在此处添加错误处理逻辑。
  }
}

// 将File对象转换为Buffer
function readFileAsBuffer(file: any) {
  return new Promise((resolve, reject) => {
    const reader: any = new FileReader();
    reader.onload = () => resolve(new Buffer(reader.result));
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
