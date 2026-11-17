package chat

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"encoding/xml"
	"errors"
	"io"
	"strings"
	"unicode/utf8"
)

// ExtractDocument reads only document text; embedded files, macros and external links are never opened.
func (c *Chat) ExtractDocument(name, encoded string) (string, error) {
	if !strings.HasSuffix(strings.ToLower(name), ".docx") || len(name) > 400 || len(encoded) > base64.StdEncoding.EncodedLen(20*1024*1024) {
		return "", errors.New("请选择 20 MiB 以内的 DOCX 文件")
	}
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(data) > 20*1024*1024 {
		return "", errors.New("文档数据无效")
	}
	archive, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return "", errors.New("文档不是有效的 DOCX 文件")
	}
	for _, file := range archive.File {
		if file.Name != "word/document.xml" {
			continue
		}
		if file.UncompressedSize64 > 4*1024*1024 {
			return "", errors.New("文档正文过大，请导出为较小的文本后添加")
		}
		reader, err := file.Open()
		if err != nil {
			return "", err
		}
		defer reader.Close()
		decoder := xml.NewDecoder(io.LimitReader(reader, 4*1024*1024+1))
		var out strings.Builder
		inText := false
		for {
			token, err := decoder.Token()
			if err == io.EOF {
				break
			}
			if err != nil {
				return "", errors.New("文档正文 XML 无效")
			}
			switch value := token.(type) {
			case xml.StartElement:
				if value.Name.Local == "t" {
					inText = true
				}
				if value.Name.Local == "tab" {
					out.WriteByte('\t')
				}
				if value.Name.Local == "br" {
					out.WriteByte('\n')
				}
			case xml.EndElement:
				if value.Name.Local == "t" {
					inText = false
				}
				if value.Name.Local == "p" {
					out.WriteByte('\n')
				}
			case xml.CharData:
				if inText {
					out.Write(value)
				}
			}
			if out.Len() > 128*1024 {
				return "", errors.New("文档文字超过 128 KiB，请拆分后添加")
			}
		}
		text := strings.TrimSpace(out.String())
		if text == "" || !utf8.ValidString(text) {
			return "", errors.New("文档没有可读取的文字，扫描件请作为图片添加")
		}
		return text, nil
	}
	return "", errors.New("DOCX 缺少正文")
}
